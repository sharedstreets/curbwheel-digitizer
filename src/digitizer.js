var app = {

	state: {
		templates: {
			regulations: {},
			timeSpans: {}
		},

		raw: {
			regulations:[],
			timeSpans: {}
		},

		currentTimeSpanTarget: {}
	},

	io: {

		// cull table rows that are entirely nulls/falses/undefineds 
		cullEmptyRows: (data) => {

			var output = data.filter(row => {
				const entries = Object.entries(row).map(keyValuePair=>keyValuePair[1]);
				return entries.filter(item => !item).length>0
			})

			return output
		},

		// 
		resolveTemplateReference: (templateType, obj, indices)=>{

			const cull = app.io.cullEmptyRows;

			const paramName = `${templateType}Template`;
			const value = obj[paramName];
			// entries using templates will have a string for the value
			const itemUsesATemplate = typeof value === 'string';

			var output;

			// if using template, fetch template from template object
			if (itemUsesATemplate) output = app.utils.clone(app.state.templates[templateType+'s'][value])

			// if inline, retrieve the 
			else {
				if (templateType === 'regulation') {
					const rawRegulation = app.state.raw.regulations[indices[0]];
					output = rawRegulation ? cull(app.utils.clone(rawRegulation)) : []
				}

				else {
					const rawTimeSpan = app.state.raw.timeSpans[indices.join('-')];
					output = rawTimeSpan ? cull(app.utils.clone(rawTimeSpan)) : []
				}
				
			}

			output = output || []
			delete obj[paramName];
			return output
		},

		export: () => {

			const cull = app.io.cullEmptyRows;
			const featuresData = app.ui.featuresList.getSourceData();

			var exportedData = app.utils.clone(app.state.inputSurvey);

			exportedData = exportedData.features.map((ft,i) => {

				var regs = cull(app.io.resolveTemplateReference('regulation', featuresData[i], [i]));
				regs.forEach((regulation, rIndex) => {
					regulation.timeSpans = cull(app.io.resolveTemplateReference('timeSpan', regulation, [i, rIndex]))
				})

				ft.properties = {

					location: {
						shstRefId: ft.properties['shst_ref_id'],
						shstLocationStart: ft.properties.dst_st,
						shstLocationEnd: ft.properties.dst_end,
						assetType: featuresData[i].assetType,
						assetSubtype: featuresData[i].assetSubtype,
						feat_id: ft.properties['feat_id']
					},

					regulations: regs.map((reg, rIndex) => {

						var output = {

							rule: {
								activity: reg.activity,
								maxStay: reg.maxStay,
								userClasses: reg.userClasses,
								userSubClasses: reg.userSubClasses,
								priorityCategory: reg.priorityCategory,
								payment: reg.payment
							},

							payment: !reg.payment ? undefined : {
								rates: reg.rates,
								durations: reg.durations,
								methods: reg.methods,
								forms: reg.forms,
								phone: reg.phone,
								operator: reg.operator
							},

							timeSpans: reg.timeSpans.map(span => {

								var tS = {

									//form arrays of daysOfWeek and month occurrences
									daysOfWeek: {
										days: app.constants.daysOfWeek.filter(day=>span[day]),
										occurrencesInMonth: app.constants.occurrencesInMonth.filter(occ=>span[occ])
									},

									//single pair of from-to times
									timesOfDay:[{
										from: span.start,
										to: span.end
									}],

									effectiveDates:[{
										from: span.from,
										to: span.end
									}]
								}

								return tS
							})
						}

						return output
					})
				}

				return ft
			})


			exportedData = {
				"type": "FeatureCollection",
				"features": exportedData,
				"manifest": app.constants.manifest
			}
			console.log(exportedData)

			// prepare asset export

			const assetLookupTable = {}

			for (feature of exportedData.features){
				const locationProps = feature.properties.location;
				assetLookupTable[locationProps['feat_id']] = {type: locationProps.assetType, subtype:locationProps.assetSubtype }
			}


			for (asset of app.state.assetExport.features) {
				const targetFeature = assetLookupTable[asset.properties['feat_id']];
				asset.properties.assetType = targetFeature.type;
				asset.properties.assetSubtype = targetFeature.subtype
			}

			app.io.downloadItem(exportedData, 'curblr_'+Date.now()+'.json');
			app.io.downloadItem(app.state.assetExport, 'assets_'+Date.now()+'.geojson');

		},

		downloadItem: (payload, fileName) =>{
			console.log(fileName, payload)
			var element = document.createElement('a');
			element.style.display = 'none';

			const blob = new Blob([JSON.stringify(payload)], {type: "application/json"});
			var url = window.URL.createObjectURL(blob);
			
			element.setAttribute('href', url);
			element.setAttribute('download', fileName);

			document.body.appendChild(element);

			element.click();
		    document.body.removeChild(element);
		},

		// save current survey in localStorage
		saveSurvey: () => {
			app.state.lastSaveTime = Date.now();
			localStorage.setItem(`survey-${app.state.rootPath}`, JSON.stringify(app.state))
			localStorage.setItem('lastSaveTime', Date.now())
			console.log('state')
			console.log(app.state)
			console.log('saved')
		},

		loadData: () =>{

			// retrieve survey root path, with trailing slash ensured
			app.state.rootPath = location.search.replace('?survey=', '') || 'src/sampleSurvey/';
			if (app.state.rootPath[app.state.rootPath.length-1] !== '/') app.state.rootPath.push('/')


			// check if there's a cached copy in localStorage, from previous session 
			const previousSession = localStorage[`survey-${app.state.rootPath}`];
			if (previousSession) {

				const survey = JSON.parse(previousSession)
				const time = app.utils.expressTime(Date.now()-survey.lastSaveTime);
				const prompt = confirm(`This survey was last digitized ${time} ago. Resume the previous session?`)

				// if accept, load data from cache
				if (prompt) {
					app.state = survey;
					app.init.map();
					app.init.ui();
				}

				// if reject, fetch survey from scratch
				else app.io.fetchSurvey()

			}

			// if no cached copy, fetch survey from scratch
			else app.io.fetchSurvey()
		},

		fetchSurvey: () =>{
			// download spans
			d3.json(app.state.rootPath+'spans.json', (e,r)=>{

				if (e) alert('No survey found at this url. Ensure the survey path is valid, preceded by "?survey=" in the url of this page.')

				// initiate UI, and fetch points json for eventual asset export
				else {

					app.state.inputSurvey = r

					app.state.inputSurvey.features
						.sort((a,b)=>a.properties.label>b.properties.label ? 1 : -1)
						.forEach((d,i)=>{
							d.properties.id = i;
						});

					app.init.map();

					// prep data, sorted by label
					app.state.raw.features = app.state.inputSurvey.features
						.map(f=>{
							//create separate object for curblr properties

							var entry = {}	
							// extract survey values into curblr
							app.constants.ui.tableColumns.featuresList
								.forEach(param=>{entry[param.data] = f.properties[param.data]})		

							return entry			
						})


					app.init.ui();



					d3.json(app.state.rootPath+'points.json', (pointsError,r)=>{

						if (pointsError) alert('No asset metadata found at the provided path. Ensure there is a "points.json" file in this directory.')
						app.state.assetExport = r;
					})
				}
			
			})	
		}
	},


	init: {

		map: (geometry) => {

			mapboxgl.accessToken = "pk.eyJ1IjoibW9yZ2FuaGVybG9ja2VyIiwiYSI6Ii1zLU4xOWMifQ.FubD68OEerk74AYCLduMZQ";

			var map = new mapboxgl.Map({
				container: 'map',
				style: 'mapbox://styles/mapbox/satellite-streets-v9'
			})
			.on('load', () => {

				const geometry = app.state.inputSurvey;

				map.fitBounds(turf.bbox(geometry), {duration:2, padding:100});
				map
					.addLayer({
						id: 'spans', 
						type: 'line', 
						source: {
							type:'geojson',
							data: geometry
						},
						layout: {
							'line-cap':'round',
						},
						paint: {
							'line-color': 'orangered',
							'line-opacity':{
								stops:[[16,1], [22, 0.25]]
							},
							'line-width':{
								base:1.5,
								stops: [[6, 1], [22, 20]]
							},
							'line-offset': {
								property:'ref_side',
								type:'categorical',
								base:2,
								stops:[
									[{zoom: 12, value: 'left'}, -5],
									[{zoom: 12, value: 'right'}, 5],
									[{zoom: 22, value: 'left'}, -300],
									[{zoom: 22, value: 'right'}, 300]
								]
							}
						}
					}, 'waterway-label')
					.addLayer({
						id: 'span-active', 
						type: 'line', 
						source: 'spans',
						filter:['==', 'id', 'null'],
						layout: {
							'line-cap':'round',
						},
						paint: {
							'line-color': 'orangered',
							'line-width':{
								base:1.5,
								stops: [[6, 1], [22, 60]]
							},
							'line-offset': {
								property:'ref_side',
								type:'categorical',
								base:2,
								stops:[
									[{zoom: 12, value: 'left'}, -5],
									[{zoom: 12, value: 'right'}, 5],
									[{zoom: 22, value: 'left'}, -300],
									[{zoom: 22, value: 'right'}, 300]
								]
							}
						}
					}, 'waterway-label')
					.addLayer({
						id: 'span-active-core', 
						type:'line',
						source: 'spans',
						filter:['==', 'id', 'null'],
						layout: {
							'line-cap':'round',
						},
						paint: {
							'line-color': 'white',
							'line-width':{
								base:1.5,
								stops: [[6, 1], [22, 20]]
							},
							'line-offset': {
								property:'ref_side',
								type:'categorical',
								base:2,
								stops:[
									[{zoom: 12, value: 'left'}, -5],
									[{zoom: 12, value: 'right'}, 5],
									[{zoom: 22, value: 'left'}, -300],
									[{zoom: 22, value: 'right'}, 300]
								]
							}
						}
					}, 'waterway-label')
			})

			app.ui.map = map;
		},

		ui: () =>{

			app.constants.ui.tableColumns.timeSpansList[0].source=
			app.constants.ui.tableColumns.timeSpansList[1].source=
			app.utils.makeTimes();

			var featuresList = new Handsontable(

				document.getElementById('featuresList'), 

				{
				
					data: app.state.raw.features,

					dataSchema: app.utils.arrayToNullObj(app.constants.ui.tableColumns.featuresList),
					width: '100%',
					rowHeaders: true,
					colHeaders: app.constants.ui.tableColumns.featuresList.map(c=>c.data),
					filters: true,
					outsideClickDeselects: false,
					autoWrapRow: false,

					columns:app.constants.ui.tableColumns.featuresList,

					afterChange: (changes) => {
						if (changes) {

							app.ui.updateFeaturesListSettings(changes)

							const templateChanges = changes.filter(change=>change[1] === 'regulationTemplate');
							if (templateChanges.length>0) app.ui.resolveTemplates(templateChanges, 'regulation')
	
						}

					},

					afterSelection: () => d3.select('#regulations .currentTarget').attr('inline', ''),

					afterSelectionEnd: (row, column, row2, column2, preventScrolling)=>{
						app.ui.onSelectingFeature(row, column, row2, column2, preventScrolling);
					},

					stretchH:'all',
					licenseKey: 'non-commercial-and-evaluation'
				}
			);
		
			var regulationsList = new Handsontable(

				document.getElementById('regulationsList'), 
				{

					data: [],

					dataSchema: app.utils.arrayToNullObj(app.constants.ui.tableColumns.regulationsList),
					minRows:15,
					rowHeaders: true,
					nestedHeaders:[
						[	
							{label: 'Payment', colspan:7, width:200},
							{label: 'Properties', colspan:6}
						],
						app.constants.ui.tableColumns.regulationsList.map(r=>r.data)
					],
					collapsibleColumns: app.constants.regulationsCollapsingScheme,

					// colHeaders: app.constants.ui.tableColumns.regulationsList.map(r=>r.data),
					columns: app.constants.ui.tableColumns.regulationsList,
					outsideClickDeselects: false,
					autoWrapRow: false,


					afterChange: (changes) => {

						if (changes) {

							var paymentWasChanged = changes
								.map(change => change[1])
								.some(col => col === 'payment')

							//propagate assetType to assetSubType
							if (paymentWasChanged) app.ui.updateRegulationsListSettings()

							app.ui.onChangedRegulations()

							// isolate changes to the timespan template
							const templateChanges = changes.filter(change=>change[1] === 'timeSpanTemplate');
							if (templateChanges.length>0) app.ui.resolveTemplates(templateChanges, 'timeSpan')
						}
					},

					afterSelectionEnd: (row, column, row2, column2)=> app.ui.onSelectingRegulation(row, column, row2, column2),

					stretchH:'all',
					licenseKey: 'non-commercial-and-evaluation'
				}
			)

			var timeSpansList = new Handsontable(

				document.getElementById('timeSpansList'), 
				{
					minRows:15,
					width:'100%',
					dataSchema: app.utils.arrayToNullObj(app.constants.ui.tableColumns.timeSpansList),
					rowHeaders: true,
					colHeaders: true,
					nestedHeaders:[
						[	
							{label: 'timeOfDay', colspan:2},
							{label: 'Occurring each', colspan:17}
						],

						[
							{label: 'span', colspan:2},
							{label: 'week', colspan:7},
							{label: 'month', colspan:6},
							{label: 'date range', colspan:2},
							{label: 'event', colspan:2},
						],
						
						app.constants.ui.tableColumns.timeSpansList.map(t=>t.data)
						
					],

					columns: app.constants.ui.tableColumns.timeSpansList,
					customBorders: app.constants.ui.timeSpanBorderScheme,

					collapsibleColumns: app.constants.timeSpansCollapsingScheme,
					stretchH: 'all',
					licenseKey: 'non-commercial-and-evaluation',
					afterSetDataAtCell: app.ui.onChangedTimeSpans
				}
			)


			app.ui.featuresList = featuresList;
			app.ui.regulationsList = regulationsList;
			app.ui.timeSpansList = timeSpansList;

			app.ui.collapseTables();
			//prevent inadvertent browser-back behavior when overscrolling
			d3.selectAll('.section')
				.on('wheel', ()=>event.preventDefault())

			// hack to work around afterSelectionEnd's focus stealing on regulation checkboxes
			d3.selectAll('#regulationsList *')
				.on('mousedown', ()=>{event.target.click()})

			setInterval(app.io.saveSurvey, 5000)
		}
	},



	setState: (key, value, cb) => {

		if (key === 'currentRegulationTarget') {

			// update images

			var images = d3.selectAll('#images')
			images.selectAll('img').remove()

			//if selecting single row, update images
			if (value.inlineFeature >= 0) {			

				images
					.selectAll('img')
					.data(

						app.state.inputSurvey.features[value.inlineFeature]
							.properties.images
					)

					.enter()
					.append('img')
					.attr('src', d=>app.state.rootPath+d)
					.attr('class','inlineBlock mr10 image');

			}


			d3.select('#regulations')
				.attr('disabled', value.disabledMessage || undefined)

			if (!value.disabledMessage) {

				const existingTemplate = app.state.templates.regulations[value.template];

				// update regulations sheet heading
				const vIndex = value.visualRange;
				const singleRowSelected = typeof vIndex === 'number';

				// populate span number if inline (template populated by CSS atr)
				d3.select('#regulations .currentTarget')
					.attr('type', value.template)
					.attr('inline', ()=> {
						
						if (value.template) return undefined

						else if (singleRowSelected) return `span #${vIndex+1}`
						else return `spans #${vIndex.map(n=>n+1).join('-')}`

					})
				
				// update regulations input call to action: rename template if currently one, create template if currently isn't
				d3.select('#regulationPrompt')
					.text(existingTemplate ? 'Rename template' : 'Make this a template')

				d3.select('#regulationInput')
					.property('value', value.template || '')


				// UPDATE REGULATIONS SHEET
				var regulationToRender;

				if (value.template) regulationToRender = existingTemplate || [];
				else if (singleRowSelected) regulationToRender = app.state.raw.regulations[value.inlineFeature] || []
				else if (value.inlineFeatures) console.log('deprecated')//regulationToRender = [];

				app.ui.regulationsList.loadData(app.utils.clone(regulationToRender))

				const filter = value.rawRange.length>1 ? ['in', 'id'].concat(value.rawRange) : ['in', 'id', value.rawRange]
				
				//update map
				app.ui.map
					.setFilter('span-active', filter)
					.setFilter('span-active-core', filter)

				if (value.rawRange > -999) {
					const bbox = turf.bbox(app.state.inputSurvey.features[value.rawRange])
					app.ui.map.fitBounds(bbox, {padding:30, maxZoom:18})
				}
			}

			// if empty value, clear regulations sheet
			else app.ui.regulationsList.loadData([])	

			app.ui.collapseTables();

		}

		else if (key === 'currentTimeSpanTarget') {

			d3.select('#timespans')
				.attr('disabled', value.disabledMessage || undefined)

			if (value.disabledMessage) app.ui.timeSpansList.loadData([])

			else {

				const vIndex = value.visualRange;
				const singleRowSelected = typeof vIndex === 'number';
				
				// UPDATE TIMESPANS SHEET
				var timeSpanToRender;
				const existingTemplate = app.state.templates.timeSpans[value.template];
				// if currently selecting a template
				if (value.template) timeSpanToRender = existingTemplate || [];
				
				// if currently selecting a single inline regulation
				else if (singleRowSelected) {

					const singleIF = app.state.currentRegulationTarget.inlineFeature;

					// if currently selecting a single inline feature
					timeSpanToRender = app.state.raw.timeSpans[singleIF+'-'+value.inlineRegulation] || []
				}
				
				else timeSpanToRender = [];

				// render new timespans data and collapse table
				app.ui.timeSpansList.loadData(app.utils.clone(timeSpanToRender))

				// update regulations sheet heading

				d3.select('#timespans .currentTarget')
					.attr('type', value.template)
					.attr('inline', ()=> {
						
						if (value.template) return undefined

						else if (singleRowSelected) return `regulation #${vIndex+1}`
						else console.log('deprecated')//return `spans #${vIndex.map(n=>n+1).join('-')}`

					})
				//update regulations input call to action: rename template if currently one, create template if currently isn't
				d3.select('#timeSpanPrompt')
					.text(existingTemplate ? 'Rename template' : 'Make this a template')

				d3.select('#timeSpanInput')
					.property('value', value.template || '')


			}

			
			app.ui.collapseTables();

		}


		app.state[key] = value;
		if (cb) cb()
	},

	ui:{

		collapseTables: () => {
			['timeSpans', 'regulations'].forEach(type=>{
				app.constants[type+'CollapsingScheme']
					.forEach(item => app.ui[type+'List'].getPlugin('collapsibleColumns').collapseSection(item))
			})
		},

		// when timespanslist changes, update inline or template
		onChangedTimeSpans: () => {

			setTimeout(() => {

				var data = app.ui.timeSpansList.getSourceData();
				const cRT = app.state.currentRegulationTarget;				
				const cTT = app.state.currentTimeSpanTarget;

				// if the current timespan target is a template, apply data to template
				if (cTT.template) app.state.templates.timeSpans[cTT.template] = data

				// if the current target is inline, apply it to the right key in feature-regulation format
				else {
					const targetFeatures = [cRT.inlineFeature] || cRT.inlineFeatures;
					const targetRegulations = [cTT.inlineRegulation] || cTT.inlineRegulations;
					targetFeatures.forEach(fIndex=>{
						targetRegulations.forEach(rIndex=>{
							app.state.raw.timeSpans[fIndex+'-'+rIndex] = data
						})
					})
				}

			}, 1)
			
		},

		// whenever selecting new cell in regulations list
		onSelectingRegulation: (row, column, row2, column2) => {

			var range = row === row2 ? row : [row, row2]
			if (range[1]<range[0]) range.reverse()

			var cTT = {rawRange:range, visualRange:range}

			const newRowsSelected = !app.state.currentTimeSpanTarget || JSON.stringify(app.state.currentTimeSpanTarget.rawRange) !== JSON.stringify(cTT.rawRange)
			const rlData = app.ui.regulationsList.getSourceData();

			if (newRowsSelected) {
				const singleRegulationSelected = row === row2;

				// if selected a single regulation
				if (singleRegulationSelected) {
					const templateName = rlData[row].timeSpanTemplate
					if (templateName) cTT.template = templateName;
					else cTT.inlineRegulation = row
				}

				// if selecting multiple regs

				else {
					cTT = {disabledMessage:'notSelected'}

					// cTT.inlineRegulations = range
					// cTT.rawRange = [];
					// var allInline = true

					// for (var f=range[0]; f<=range[1]; f++) {
					// 	if (rlData[f].timeSpanTemplate) allInline = false;
					// 	else cTT.rawRange.push(f)
					// }
		
					// if (!allInline) cRT = {disabledMessage: 'containsTemplate'};
					

				}

				// if editing
				app.setState('currentTimeSpanTarget', cTT)
			}

		},

		// whenever regulationsList changes, apply change to the right place
		onChangedRegulations: () =>{

			setTimeout(() => {

				var data = app.ui.regulationsList.getSourceData();
				const cRT = app.state.currentRegulationTarget;

				const singleRowSelected = !cRT.inlineFeatures;
				
				// if single row, change the template or inline regulations directly
				if (singleRowSelected) {
					if (cRT.template) app.state.templates.regulations[cRT.template] = data
					
					else app.state.raw.regulations[cRT.inlineFeature] = data;
				}
				
				// if multiple features selected, overwrite with inline regulations
				else {
					console.warn('changed regulations on multiple features. deprecated.')
					// for (var f = cRT.inlineFeatures[0]; f<=cRT.inlineFeatures[1]; f++) {
					// 	app.state.raw.regulations[f] = data
					// 	app.ui.featuresList.setSourceDataAtCell(f, 4, undefined)
					// }
				}
													
			}, 1)
			
		},

		// apply change to input element
		timeSpanInputSubmit: () =>{


				const text = d3.select('#timespanInput').property('value');
				const cTT = app.state.currentTimeSpanTarget

				// throw on name collision
				if (app.state.templates.timeSpans[text]) {
					alert('A template by this name already exists. Please choose a new one.')
					return
				}

				// e.target.blur();

				var oldData = app.ui.regulationsList.getSourceData();

				// if editing a template
				if (cTT.template){

					const oldTemplateName = cTT.template;

					// copy template over and delete old template key
					app.state.templates.timeSpans[text] = app.state.templates.timeSpans[oldTemplateName] || [];
					delete app.state.templates.timeSpans[oldTemplateName];

					//change all references of old template, to new
					oldData.forEach(row=>{
						if (row.timeSpanTemplate===oldTemplateName) {row.timeSpanTemplate = text}
					})

				}

				// if creating a template from inline
				else {

					//create new template with whatever's currently in the timespansList
					app.state.templates.timeSpans[text] = app.ui.timeSpansList.getSourceData();

					// apply template to all selected regulations
					const iRs = cTT.inlineRegulations;
					if (iRs) for (var f=iRs[0]; f<=iRs[1]; f++) oldData[f].timeSpanTemplate = text;
					else oldData[cTT.inlineRegulation].timeSpanTemplate = text;

				}

				// apply name updates to the regulation store (template or inline)
				const cRT = app.state.currentRegulationTarget;

				if (cRT.template) app.state.templates.regulations[cRT.template] = oldData
				else {
					const iFs = cRT.inlineFeatures;
					if (iFs) console.log('deprecated')//for (var f=iFs[0]; f<=iFs[1]; f++) app.state.raw.regulations[f] = oldData
					else app.state.raw.regulations[cRT.inlineFeature] = oldData
				}
				app.ui.regulationsList.loadData(oldData);

				const newCTT = {template:text, rawRange:cTT.rawRange}
				app.setState('currentTimeSpanTarget', newCTT)
				app.ui.updateTemplateTypeahead('timeSpans')
				app.ui.collapseTables()

				return false
		},

		// apply change to input element
		regulationInputSubmit: () =>{

			const input = d3.select('#regulationInput');
			const text = input.property('value');
			const cRT = app.state.currentRegulationTarget

			// throw on name collision
			if (app.state.templates.regulations[text]) {
				alert('A template by this name already exists. Please choose a new one.')
				input.node().focus();
				return false
			}

			input.node().blur();
			var fLData = app.ui.featuresList.getSourceData();

			// if editing a template
			if (cRT.template){

				const oldTemplateName = cRT.template;

				// copy template over and delete old template key
				app.state.templates.regulations[text] = app.state.templates.regulations[oldTemplateName] || [];
				delete app.state.templates.regulations[oldTemplateName];

				//change all references of old template, to new

				fLData.forEach(row=>{
					if (row.regulationTemplate===oldTemplateName) row.regulationTemplate = text
				})

			}

			// if creating a template from inline
			else {

				//create new template with whatever's currently in the regulationslist
				app.state.templates.regulations[text] = app.ui.regulationsList.getSourceData()

				// apply template to active feature(s)
				const iFs = cRT.inlineFeatures
				if (iFs) console.log('deprecated')//for (var f=iFs[0]; f<=iFs[1]; f++) fLData[f].regulationTemplate = text;
				else fLData[cRT.inlineFeature].regulationTemplate = text;

			}

			let newCRT = cRT;
			newCRT.template = text;
			console.log(newCRT)
			/*
			const newCRT = {
				template:text, 
				rawRange:cRT.rawRange
			}
			*/

			app.setState('currentRegulationTarget', newCRT)
			app.ui.updateTemplateTypeahead('regulations')
			app.ui.featuresList.loadData(fLData);
			app.state.raw.features = fLData;
		
			return false
		},


		// show the proper regulations scheme (either inline or templated)
		onSelectingFeature: (row, column, row2, column2, preventScrolling) => {

			const fL = app.ui.featuresList;
			var range = row === row2 ? row : [row, row2]
			if (range[1]<range[0]) range.reverse()

			var cRT = {visualRange:range};
			const singleFeatureSelected = row === row2;

			if (singleFeatureSelected) {
				const flData = fL.getSourceData();

				const physicalRow = fL.toPhysicalRow(row);
				const templateName = flData[physicalRow].regulationTemplate;

				cRT.rawRange = physicalRow

				if (templateName) {
					cRT.template = templateName
				}
				cRT.inlineFeature = physicalRow
			}

			else {

				cRT = {disabledMessage:'notSelected'}

				// below: deprecated logic for handling multi-row selections

				// cRT.inlineFeatures = range.map(row=>fL.toPhysicalRow(row))
				// cRT.rawRange = [];
				// var allInline = true

				// for (var f = range[0]; f<=range[1]; f++) {
				// 	if (flData[f].regulationTemplate) allInline = false;
				// 	else cRT.rawRange.push(f)
				// }
	
				// if multiple features selected, make sure none are templates before applying currentRegulationTarget
	
				// if (!allInline) cRT = {disabledMessage: 'containsTemplate'};
				

			}


			app.setState('currentRegulationTarget', cRT, ()=>{
				app.setState('currentTimeSpanTarget', {disabledMessage:'notSelected'})
			})

			app.ui.regulationsList.deselectCell()

			app.ui.updateRegulationsListSettings()			

		},

		updateFeaturesListSettings: (changes) =>{

			const featuresList = app.ui.featuresList;
			var data = featuresList.getSourceData();
			var cellsToClear = []

			var assetTypeWasChanged = changes
				.some(change => change[1] === 'assetType')

			const templateWasChanged = changes
				.some(change => change[1] === 'regulationTemplate')

			if (templateWasChanged) app.ui.updateTemplateTypeahead('regulations')

			if (assetTypeWasChanged) {
				featuresList.updateSettings({

					cells: (row, col, prop) => {

						var cellProperties = {}
					    
						// if currently at assetSubtype column
					    if (assetTypeWasChanged && col === 3) {

							var parentValue = data[row].assetType;
							var propagatingRule = app.constants.ui.entryPropagations.assetType.propagatingValues[parentValue]

					    	// if assetType is a value that allows subtype (indicated by presence of propagating rule)
					    	if (propagatingRule){

								cellProperties = {
									readOnly:false, 
									type: propagatingRule.values ? 'autocomplete' : 'text', 
									source: propagatingRule.values,
									placeholder: propagatingRule.placeholder
								}
					    	}
							
							// if subtype not allowed, clear value
							else cellsToClear.push([row, col])		
					    }

					    return cellProperties;
					}
				})

				cellsToClear
					.forEach(
						array=>featuresList.setDataAtCell(array[0], array[1], undefined)
					)
			}

		},

		// enable/disable payment cells depending on payment status
		updateRegulationsListSettings: (changes) => {

			var data = app.ui.regulationsList.getSourceData();
			var cellsToClear = []
			app.ui.regulationsList.updateSettings({

				cells: (row, col, prop) => {

					var cellProperties = {}
					const thereIsPayment = data[row].payment;
					
					// if currently at a propagated column
				    if (app.constants.paymentParams.includes(prop)) {
						cellProperties = {
							readOnly:!thereIsPayment
						}

				    	if (!thereIsPayment) data[row][prop] = undefined		

				    }

				    return cellProperties;
				}
			})

			app.ui.regulationsList.loadData(data)
			app.ui.collapseTables()
		},

		updateTemplateTypeahead: (templateType)=>{

			const extantTemplates = Object.keys(app.state.templates[templateType]);

			const parentList = {
				regulations:'featuresList',
				timeSpans: 'regulationsList'
			}

			var defaultColumns = app.utils.clone(app.constants.ui.tableColumns[parentList[templateType]]);
			defaultColumns[defaultColumns.length-1].type = 'autocomplete';
			defaultColumns[defaultColumns.length-1].source = extantTemplates;


			app.ui[parentList[templateType]].updateSettings({
				columns: defaultColumns
			})
		},

		// when a template reference changes, mutate the template as necessary
		resolveTemplates: (templateChanges, kind) =>{

			// inline to new template: define new template as previous inline value
			// template to inline: use template value for inline
			// existing template to new template: duplicate values in old template for new one

			const templateType = kind+'s';

			templateChanges
				.forEach(change => {

					const [row, column, oldValue, newValue] = change
					const fromInline = !(oldValue && oldValue.length>0);
					const templateSpecified = newValue && newValue.length>0
					const toExistingTemplate = app.state.templates[templateType][newValue]
					const toNewTemplate = templateSpecified && !toExistingTemplate
					
					var cT = {visualRange:row, rawRange: row};

					// if going from inline,
					if (fromInline) {

						// to any template
						if (templateSpecified) {

							//set target template
							cT.template = newValue

							// if to specifically a new template
							if (toNewTemplate) {

								const existingInline = app.state.raw[templateType][row] || []

								// apply the current inline value to the template (or empty if it doesn't exist)
								app.state.templates[templateType][newValue] = existingInline
								
							}	
						}
					
					}

					// if there was an old value,
					else {

						// that got cleared to blank, apply that previous template as this feature's inline value
						if (!templateSpecified) {
							cT.inlineFeature = row;
							const oldTemplateContents = app.state.templates[templateType][oldValue];
							
							if (kind === 'regulation') app.state.raw[templateType][row] = oldTemplateContents
							
							else if (kind === 'timeSpan') {

								const cRT = app.state.currentRegulationTarget;

								if (cRT.inlineRegulation) app.state.raw.timeSpans[cRT.inlineRegulation+'-'+row] = oldTemplateContents
								
								else for (var s = cRT.inlineRegulations[0]; s<=cRT.inlineRegulations[1]; s++){
									app.state.raw.timeSpans[s+'-'+row] = oldTemplateContents
								}
							}
						}
						
						// but if it changes to a new template, copy over the template from old to new
						else if (toNewTemplate) {
							cT.template = newValue;
							app.state.templates[templateType][newValue] = app.utils.clone(app.state.templates[templateType][oldValue]);
						}
					}
				
					const upperCase = kind.charAt(0).toUpperCase() + kind.slice(1)
					if (templateChanges.length ===1) app.setState(`current${upperCase}Target`, cT)
					// else console.log('multiple template changes. need to handle?')
				})

			app.ui.updateTemplateTypeahead(templateType)
		}
	},

	utils: {

		expressTime: (ms) => {

			const thresholds = [
				[1, 'second'],
				[60, 'minute'],
				[3600, 'hour'],
				[3600*36, 'day'],
				[Infinity, 'eternity']
			]

			var seconds = ms/1000;
			var t = 0;
			var quantity;
			var unit;

			while (seconds>thresholds[t+1][0]) t++
			quantity = Math.round(seconds/thresholds[t][0])
			unit = `${thresholds[t][1]}${quantity > 1 ? 's' : ''}`;
			
			return [quantity, unit].join(' ')
		},

		combineObjects: (a,b) => {
			Object.keys(b).forEach(key=>a[key]=b[key]);
			return a
		},
		arrayToNullObj: (array) =>{
			var output = {};
			array.forEach(key=>output[key.data]= key.type === 'checkbox' ? false : null)
			return output
		},

		clone: (input) => JSON.parse(JSON.stringify(input)),
		makeTimes: ()=>{

			var output = [];
			for (var h = 0; h<24; h++) {
				const hour = h<10 ? '0'+h : h

				for (var m=0; m<60; m+=5){
					const minute = m<10 ? '0'+m : m
					output.push([hour, minute].join(':'))
				}
			}

			return output
		}
	},

	constants: {
		paymentParams: ['rates', 'durations', 'methods', 'forms', 'phone', 'operator'],
		daysOfWeek: ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'],
		occurrencesInMonth: ['1st', '2nd', '3rd', '4th', '5th', 'last'],
		ui: {
			tableColumns: {

				featuresList:[
					{
						data: 'label',
						paramName: 'label'
					},
					{
						data: 'ref_side',
						paramName: 'sideOfStreet',
						type: 'dropdown',
						source: ['left', 'right', 'unknown'],
						strict: true,
						filter:true,
						visibleRows: 4
					},
					{
						data: 'assetType',
						type: 'autocomplete',
						source: [
							'sign', 
							'curb paint', 
							'hydrant', 
							'bus stop', 
							'crosswalk', 
							'bike rack', 
							'curb extension', 
							'bollards', 
							'fence', 
							'parking meter',
							'pavement marking',
							'curb cut'
						],
						filter:true,							
						strict: true,
						visibleRows: 20,
					},					
					{
						data: 'assetSubtype',
						type: 'autocomplete',
						readOnly: true,
						placeholder: 'NA',
						visibleRows: 20,
					},
					{
						data: 'regulationTemplate',
						type: 'text',
						className:' templateStyle',
						placeholder: 'Unique values'
					}
				],

				regulationsList: [
					{
						data: 'payment',
						type: 'checkbox',
						width:60
					},	
					{
						data: 'rates',
						readOnly: true
					},
					{
						data: 'durations',
						readOnly: true
					},
					{
						data: 'methods',
						readOnly: true
					},
					{
						data: 'forms',
						readOnly: true
					},
					{
						data: 'phone',
						readOnly: true
					},
					{
						data: 'operator',
						readOnly: true
					},
					{
						type: 'dropdown',
						data: 'activity',
						source: [
							'standing', 
							'no standing', 
							'loading', 
							'no loading', 
							'parking', 
							'no parking'
						],
						strict: true,
						visibleRows: 15
					},
					{
						data: 'maxStay',
						type: 'dropdown',
						source: [5, 10, 15, 20, 30, 45, 60, 120, 180, 240, 300, 360, 480],
						strict: true,
						visibleRows: 15
					},
					{data: 'userClasses'},
					{data: 'userSubClasses'},					
					{data: 'priorityCategory'},					
					{
						data: 'timeSpanTemplate',
						className:' templateStyle',
						placeholder: 'Unique values'
					}
				],
				timeSpansList: [
					{
						data:'start',
						type: 'autocomplete',
						placeholder:'24h hh:mm',
						visibleRows: 5,
						filter:true,
						strict:true
					},
					{
						data:'end',
						type: 'autocomplete',
						placeholder:'24h hh:mm',
						visibleRows: 5,
						filter:true,
						strict:true
					},
				]
				.concat(
					['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']
						.map(day=>{
							return {
								data: day,
								type: 'checkbox',
								width:50
							}
						})
				)
				.concat(['1st', '2nd', '3rd', '4th', '5th', 'last']
					.map(occurrence=>{
						return {
							data: occurrence,
							type: 'checkbox',
							width:50
						}
					})
				)
				.concat(['from', 'to']
					.map(endpoint=>{
						return {
							data: endpoint,
							type: 'date'
						}
					})
				)
				.concat(['apply', 'event']
					.map(item=>{
						return {
							data: item,
							type: 'text',
							width:80
						}
					})
				)
			},
			timeSpanBorderScheme: [
				{
					range: {
					from: {
						row: 0,
						col: 2
					},
					to: {
						row: 99999,
						col: 2
					}
					},
					left: {
						width: 2,
						color: 'rgb(75, 137, 255)'
					}
				},
				{
					range: {
					from: {
						row: 0,
						col: 9
					},
					to: {
						row: 99999,
						col: 9
					}
					},
					left: {
						width: 2,
						color: 'rgb(75, 137, 255)'
					}
				},
				{
					range: {
					from: {
						row: 0,
						col: 15
					},
					to: {
						row: 99999,
						col: 15
					}
					},
					left: {
						width: 2,
						color: 'rgb(75, 137, 255)'
					}
				},
				{
					range: {
					from: {
						row: 0,
						col: 17
					},
					to: {
						row: 99999,
						col: 17
					}
					},
					left: {
						width: 2,
						color: 'rgb(75, 137, 255)'
					}
				},
			],
			entryPropagations: {
				assetType: {
					destinationProp: 'assetSubtype',
					propagatingValues: {

						'curb cut': {
							placeholder: 'Marking type',
							values: [
								'ramp', 
								'driveway', 
								'street'
							]
						},

						'pavement marking': {
							placeholder: 'Cut type',
							values: [
								'bike', 
								'bus', 
								'taxi', 
								'arrow', 
								'diagonal lines', 
								'zigzag', 
								'parallel parking', 
								'perpendicular parking', 
								'yellow', 
								'red', 
								'blue', 
								'ISA'
							]
						},

						'curb paint': {
							placeholder: 'Paint color',
							values: [
								'red',
								'yellow',
								'white',
								'blue',
								'green'
							]
						},
					}					
				}
			},

			// entryParams: [
			// 	{
			// 		param: 'shstRefId',
			// 		placeholder: 'unique identifier',
			// 		inputProp: 'shst_ref_id'
			// 	},

			// 	{
			// 		param: 'sideOfStreet',
			// 		placeholder: 'street side',
			// 		inputProp: 'ref_side'
			// 	},

			// 	{
			// 		param: 'shstLocationStart',
			// 		placeholder: 'start of regulation',
			// 		inputProp: 'dst_st'
			// 	},			
			// 	{
			// 		param: 'shstLocationEnd',
			// 		placeholder: 'end of regulation',
			// 		inputProp: 'dst_end'
			// 	},			
			// 	{
			// 		param: 'assetType',
			// 		inputProp: 'assetType'
			// 	},
			// 	{
			// 		param: 'assetSubtype',
			// 		defaultHidden: true
			// 	}					

			// ]

		},

		timeSpansCollapsingScheme: [
			{row: -3, col: 2, collapsible: true}
		],
		regulationsCollapsingScheme: [
			{row:-2, col:0, collapsible:true}
		],
		manifest:{
			"createdDate": new Date().toISOString(),
			"lastUpdatedDate": "2020-10-10T17:40:45Z",
			"priorityHierarchy": [
				"no standing",
				"construction",
				"temporary restriction",
				"restricted standing",
				"standing",
				"restricted loading",
				"loading",
				"no parking",
				"restricted parking",
				"paid parking",
				"free parking"
			],
			"curblrVersion": "1.1.0",
			"timeZone": "America/Los_Angeles",
			"currency": "USD",
			"unitHeightLength": "feet",
			"unitWeight": "tons",
			"authority": {
				"name": "Your Transportation Agency Name",
				"url": "https://www.youragencyurl.gov",
				"phone": "+15551231234"
			}
		},
		regulation: {

		}
	},
}


