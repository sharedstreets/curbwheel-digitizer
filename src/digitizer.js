var app = {

	state: {
		templates: {
			regulations: {},
			timeSpans: {}
		},

		raw: {
			regulations:[],
			timeSpans: {}
		}
	},

	// io: {

	// 	export: () => {

	// 		app.state.data.features = app.state.data.features.map(ft => {

	// 			ft = {
	// 				geometry: ft.geometry,
	// 				properties: ft.output
	// 			}

	// 			return ft
	// 		})

	// 		var element = document.createElement('a');

	// 		const blob = new Blob([JSON.stringify(app.state.data)], {type: "application/json"});
	// 		var url = window.URL.createObjectURL(blob);
			
	// 		element.setAttribute('href', url);
	// 		element.setAttribute('download', 'curblr_'+Date.now()+'.json');

	// 		element.style.display = 'none';
	// 		document.body.appendChild(element);

	// 		element.click();
	// 	    document.body.removeChild(element);
	// 	}

	// },


	init: {

		map: () => {

			mapboxgl.accessToken = "pk.eyJ1IjoibW9yZ2FuaGVybG9ja2VyIiwiYSI6Ii1zLU4xOWMifQ.FubD68OEerk74AYCLduMZQ";

			var map = new mapboxgl.Map({
				container: 'map',
				style: 'mapbox://styles/mapbox/light-v9'
			})
			.on('load', () => {

				map.fitBounds(turf.bbox(app.state.data), {duration:200, padding:100});
				map
					// .addLayer({
					// 	id: 'spans', 
					// 	type: 'fill-extrusion', 
					// 	source: {
					// 		type:'geojson',
					// 		data: data
					// 	},
					// 	paint: {
					// 		'fill-extrusion-color':'red',
					// 		'fill-extrusion-base': 2,
					// 		'fill-extrusion-height':10,
					// 		// 'line-width':5,
					// 		'fill-extrusion-opacity':0.2
					// 	}
					// })
					.addLayer({
						id: 'spans', 
						type: 'line', 
						source: {
							type:'geojson',
							data: app.state.data
						},
						layout: {
							'line-cap':'round'
						},
						paint: {
							'line-color': [
								'match',
								['get', 'id'],
								0, 'steelblue',
								'#ccc'
							],
							'line-width':{
								base:1.5,
								stops: [[6, 1], [22, 80]]
							},
							'line-opacity':0.75,
							'line-offset': {
								base:2,
								stops: [[12, 3], [22, 100]]
							}
						}
					})
			})

			app.ui.map = map;
		},

		ui: () =>{

			// prep data
			app.state.data.features.forEach((d,i)=>{

				d.properties.id = i;
				d.properties.images = JSON.parse(d.properties.images);
				
				//create separate object for curblr properties
				d.output = {
					regulations:[],
					location:{}
				}

				// extract survey values into curblr
				app.constants.ui.entryParams
					.forEach(param=>{d.output.location[param.param] = d.properties[param.inputProp]})

			})

			var data = app.state.data.features
					.map((f,i)=>[f.properties.label, f.properties.ref_side, undefined, undefined, undefined])
			
			// BUILD FILTERS

			var setupFilter = () => {

				// Event for `keydown` event. Add condition after delay of 200 ms which is counted from time of last pressed key.
				var debounceFn = Handsontable.helper.debounce(function (colIndex, event) {

					var filtersPlugin = featuresList.getPlugin('filters');

					filtersPlugin.removeConditions(colIndex);
					filtersPlugin.addCondition(colIndex, 'contains', [event.target.value]);
					filtersPlugin.filter();
					}, 200);

					var addEventListeners =  (input, colIndex) => {
						input.addEventListener('keydown', event => debounceFn(colIndex, event));
					};

				// Build elements which will be displayed in header.
				var getInitializedElements = function(colIndex) {
					var div = document.createElement('div');
					var input = document.createElement('input');
					input.placeholder = 'Filter by label';
					input.style.height = '100%'
					div.className = 'filterHeader';

					addEventListeners(input, colIndex);

					div.appendChild(input);

					return div;
				};

				document.querySelector('#featureFilter')
					.appendChild(getInitializedElements(0));
			}

			setupFilter()
			app.constants.allTimes= app.utils.makeTimes();

			var featuresList = new Handsontable(

				document.getElementById('featuresList'), 

				{
				
					data: data,
					width:'100%',
					minRows:30,
					rowHeaders: true,
					colHeaders: app.constants.properties.concat('regulationTemplate'),
					filters: true,
					outsideClickDeselects: false,
					autoWrapRow: false,
					cells: (row, col, prop) => {
						if (row >= app.state.data.features.length) return {readOnly:true, placeholder: undefined, type:null, source:undefined}
					},

					columns:app.constants.ui.tableColumns.featuresList,

					afterChange: (changes) => {

						if (changes) {
							
							var assetSubtypeWasChanged = changes
								.map(change => change[1])
								.some(col => col === 2)

							//propagate assetType to assetSubType
							if (assetSubtypeWasChanged) updateFeaturesListSettings()

							const templateChanges = changes.filter(change=>change[1] === 4);
							if (templateChanges.length>0) app.ui.resolveTemplates(templateChanges, 'regulation')
	
						}

					},

					//limit selections to feature entries (no blank rows)
					afterSelection: (row, column, row2, column2, preventScrolling, selectionLayerLevel)=>app.ui.capFeatureSelection(row, column, row2, column2, preventScrolling, selectionLayerLevel),

					//after selecting features
					afterSelectionEnd: (row, column, row2, column2, preventScrolling, selectionLayerLevel)=>app.ui.renderFeatureRegulations(row, column, row2, column2, preventScrolling, selectionLayerLevel),

					stretchH:'all',
					licenseKey: 'non-commercial-and-evaluation'
				}
			);
		
			var regulationsList = new Handsontable(

				document.getElementById('regulationsList'), 
				{

					data: [],

					dataSchema: {
						activity:null, 
						maxStay: null, 
						payment:false, 
						userClasses: null, 
						userSubClasses: null, 
						timeSpanTemplate:null
					},

					minRows:30,
					rowHeaders: true,
					colHeaders: app.constants.ui.regulationParams.map(p=>p.param),
					outsideClickDeselects: false,
					autoWrapRow: false,
					columns: app.constants.ui.tableColumns.regulationsList,


					afterChange: (changes) => {

						if (changes) {
	
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
					minRows:30,
					width:'100%',
					dataSchema: {
						0: null,
						1: null,
						2: null,
						3: null,
						4: null,
						5: null,
						6: null,
						7: null,
						8: null,
						9: null,
						10: null,
						11: null,
						12: null,
						13: null,
						14: null,
						15: null,
						16: null,
						17: null,
						18: null,
						19: null
					},
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
						
						[
							'start', 'end',
							...app.constants.validate.daysOfWeek.oneOf,
							...app.constants.validate.occurrencesInMonth.oneOf,
							'from', 'to',
							'apply', 'event'
						]
						
					],

					columns: new Array(2).fill({
							type: 'autocomplete',
							placeholder:'24h hh:mm',
							source: app.constants.allTimes,
							visibleRows: 5,
							filter:true,
							strict:true
						})
						.concat(
							app.constants.validate.daysOfWeek.oneOf
								.map(day=>{
									return {
										// data: day,
										type: 'checkbox',
										width:50
									}
								})
						)
						.concat(app.constants.validate.occurrencesInMonth.oneOf
							.map(occurrence=>{
								return {
									// data: occurrence,
									type: 'checkbox',
									width:50
								}
							})
						)
						.concat(['from', 'to']
							.map(endpoint=>{
								return {
									// data: endpoint,
									type: 'date'
								}
							})
						)
						.concat(['apply', 'event']
							.map(item=>{
								return {
									// data: item,
									type: 'text',
									width:80
								}
							})
						),
					customBorders: app.constants.ui.timeSpanBorderScheme,

					collapsibleColumns: app.constants.timeSpansCollapsingScheme,
					stretchH: 'all',
					licenseKey: 'non-commercial-and-evaluation',
					afterSetDataAtCell: app.ui.onChangedTimeSpans
				}
			)


			// bind input behavior
			d3.select('#regulationInput')
				.on('keyup', e=>app.ui.updateRegulationInput(event))
			d3.select('#timeSpanInput')
				.on('keyup', e=>app.ui.updateTimeSpanInput(event))

			const updateFeaturesListSettings = (changes) =>{

				var data = featuresList.getSourceData();
				var cellsToClear = []

				featuresList.updateSettings({

					cells: (row, col, prop) => {

						var cellProperties = {}
					    
						// if currently at assetSubType column
					    if (col === 3) {

							var parentValue = data[row][col-1];
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
						
						if (row>=app.state.data.features.length) {
							cellProperties.readOnly =true; 
							cellProperties.type = null;
							cellProperties.placeholder = undefined
						}


					    return cellProperties;
					}
				})

				cellsToClear
					.forEach(
						array=>featuresList.setDataAtCell(array[0], array[1], undefined)
					)
			}

			app.ui.featuresList = featuresList;
			app.ui.regulationsList = regulationsList;
			app.ui.timeSpansList = timeSpansList;

			app.constants.timeSpansCollapsingScheme
				// .forEach(item => timeSpansList.getPlugin('collapsibleColumns').collapseSection(item))
			
			app.ui.map.on('load', ()=>{
				featuresList.selectCell(0,0,0,0)
				regulationsList.selectCell(0,0,0,0)
			})

		}
	},



	setState: (key, value) => {

		if (key === 'currentRegulationTarget') {

			const singleRowSelected = value.inlineFeature>=0;
			// UPDATE REGULATIONS SHEET
			var regulationToRender;
			const existingTemplate = app.state.templates.regulations[value.template];

			if (value.template) regulationToRender = existingTemplate || [];
			else if (singleRowSelected) regulationToRender = app.state.raw.regulations[value.inlineFeature] || []
			else if (value.inlineFeatures) regulationToRender = [];

			// console.log('new regs', regulationToRender)
			app.ui.regulationsList.loadData(app.utils.clone(regulationToRender))
			// app.ui.regulationsList.render();


			// update regulations sheet heading
			const vIndex = value.visualRange;

			d3.select('#regulations .currentTarget')
				.attr('type', value.template)
				.attr('inline', value.template ? undefined : `span${singleRowSelected ? ' #'+(vIndex+1) : 's #'+vIndex.map(n=>n+1).join('-')}`)

			//update regulations input call to action: rename template if currently one, create template if currently isn't
			d3.select('#regulationPrompt')
				.text(existingTemplate ? 'Rename' : 'Make this a template')

			d3.select('#regulationInput')
				.property('value', value.template || '')
			
			//update map
			app.ui.map
				.setPaintProperty('spans', 'line-color',
					[
						'match',
						['get', 'id'],
						value.rawRange, 
						'steelblue',
						'#ccc'
					]
				);

			//if selecting single row, update images
			if (value.inlineFeature) {			

				var images = d3.selectAll('#images')
					.selectAll('img')
					.data(
						app.state.data.features[value.inlineFeature]
							.properties.images.map(img=>img.url)
					)

				images
					.enter()
					.append('img')
					.attr('src', d=>d)
					.attr('class','inlineBlock mr10 image');

				images
					.exit()
					.remove()
			}
		}

		else if (key === 'currentTimeSpanTarget') {

			const singleRowSelected = value.inlineRegulation>=0;

			// UPDATE REGULATIONS SHEET
			var timeSpanToRender;
			const existingTemplate = app.state.templates.timeSpans[value.template];

			if (value.template) timeSpanToRender = existingTemplate || [];
			
			else if (singleRowSelected) {

				const singleIF = app.state.currentRegulationTarget.inlineFeature;

				if (singleIF>=0) {
					if (!app.state.raw.timeSpans[singleIF]) app.state.raw.timeSpans[singleIF] = []
					timeSpanToRender = app.state.raw.timeSpans[singleIF][value.inlineRegulation] || []
				}

				else timeSpanToRender = []
			}
			
			else if (value.inlineRegulations) timeSpanToRender = [];

			// update regulations sheet heading
			const vIndex = value.visualRange;


			d3.select('#timespans .currentTarget')
				.attr('type', value.template)
				.attr('inline', value.template ? undefined : `regulation${singleRowSelected ? ' #'+(vIndex+1) : 's #'+vIndex.map(n=>n+1).join('-')}`)

			//update regulations input call to action: rename template if currently one, create template if currently isn't
			d3.select('#timeSpanPrompt')
				.text(existingTemplate ? 'Rename' : 'Make this a template')

			d3.select('#timeSpanInput')
				.property('value', value.template || '')


			// render new timespans data and collapse table
			app.ui.timeSpansList.loadData(app.utils.clone(timeSpanToRender))
			// app.ui.timeSpansList.render();

			app.constants.timeSpansCollapsingScheme
				.forEach(item => app.ui.timeSpansList.getPlugin('collapsibleColumns').collapseSection(item))

		}


		app.state[key] = value;
	},

	ui:{

		formatTime: (input) => {
			console.log('ft')
			const split = input.split(':');
			const fail = ()=>{alert('Time must be in 24-hour, HH:MM format'); return}

			if (split.length === 2){
				
				//convert to numbers		
				const numbers = split.map(n=>parseFloat(n));

				//cap and add leading zeroes

				const capped = numbers.map((d,i)=>{

					if (!d>=0) fail()
					else if (i===0 && d>23) fail()
					else if (i===1 && d>59) fail()

					else if (d<10) d='0'+d;	

					return d
				})

				return capped.join(':')
			}

		},

		// when timespanslist changes, update inline or template
		onChangedTimeSpans: () => {

			setTimeout(() => {

				var data = app.ui.timeSpansList.getSourceData();
				var templateName = app.ui.regulationsList.getSourceDataAtCell(app.state.activeRegulationIndex, 5);
				const cTT = app.state.currentTimeSpanTarget;
				const singleRowSelected = !cTT.inlineRegulations;

				// if one row selected, apply to template or inline as appropriate
				if (singleRowSelected) {
					if (cTT.template) app.state.templates.timeSpans[cTT.template] = data
					
					else app.state.raw.timeSpans[cTT.inlineRegulation] = data;
				}

				// if multiple regulations selected, apply the timespans inline-ly
				else {
					const range = cTT.inlineRegulations;
					for (var f = range[0]; f<=range[1]; f++) {
						app.state.raw.timeSpans[f] = data
						app.ui.regulationsList.setSourceDataAtCell(f, 5, undefined)
					}
				}

			}, 1)
			
		},

		// whenever selecting new cell in regulations list
		onSelectingRegulation: (row, column, row2, column2) => {

			var range = row === row2 ? row : [row, row2]
			if (range[1]<range[0]) range.reverse()

			var cTT = {rawRange:range, visualRange:range}

			
			// if selected a single regulation
			if (row === row2) {
				const templateName = app.ui.regulationsList.getSourceDataAtCell(row, 5)
				if (templateName) cTT.template = templateName;
				else cTT.inlineRegulation = row
			}

			// if selecting multiple regs
			else cTT.inlineRegulations = range
			
			app.setState('currentTimeSpanTarget', cTT)
		
		},

		// whenever regulationsList changes, apply change to the right place
		onChangedRegulations: () =>{

			setTimeout(()=>{

				var data = app.ui.regulationsList.getSourceData();
				const cRT = app.state.currentRegulationTarget;

				const singleRowSelected = !cRT.inlineFeatures;
				
				// if single row, change the template or inline regulations directly
				if (singleRowSelected) {
					console.log(cRT)
					if (cRT.template) app.state.templates.regulations[cRT.template] = data
					
					else app.state.raw.regulations[cRT.inlineFeature] = data;
				}
				
				// if multiple features selected, overwrite with inline regulations
				else {

					for (var f = cRT.inlineFeatures[0]; f<=cRT.inlineFeatures[1]; f++) {
						app.state.raw.regulations[f] = data
						app.ui.featuresList.setSourceDataAtCell(f, 4, undefined)
					}
				}
													
			},1)
			
		},

		// apply change to input element
		updateTimeSpanInput: (e) =>{

			//on enter
			if (e.which === 13) {

				const text = e.target.value;
				const cTT = app.state.currentTimeSpanTarget

				// throw on name collision
				if (app.state.templates.timeSpans[text]) {
					alert('A template by this name already exists. Please choose a new one.')
					return
				}

				e.target.blur();

				var oldData = app.ui.regulationsList.getSourceData();

				// if editing a template
				if (cTT.template){

					const oldTemplateName = cTT.template;

					// copy template over and delete old template key
					app.state.templates.timeSpans[text] = app.state.templates.timeSpans[oldTemplateName] || [];
					delete app.state.templates.timeSpans[oldTemplateName];

					//change all references of old template, to new
					oldData.forEach(row=>{
						console.log(row[5], oldTemplateName)
						if (row.timeSpanTemplate===oldTemplateName) {console.log('oldnamefound, changing', row);row.timeSpanTemplate = text}
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
					console.log(oldData)

				}

				// apply name updates to the regulation store (template or inline)
				const cRT = app.state.currentRegulationTarget;

				if (cRT.template) app.state.templates.regulations[cRT.template] = oldData
				else {
					const iFs = cRT.inlineFeatures;
					if (iFs) for (var f=iFs[0]; f<=iFs[1]; f++) app.state.raw.regulations[f] = oldData
					else app.state.raw.regulations[cRT.inlineFeature] = oldData
				}
				app.ui.regulationsList.loadData(oldData);
				// app.ui.regulationsList.render();

				const newCTT = {template:text, rawRange:cTT.rawRange}
				app.setState('currentTimeSpanTarget', newCTT)
				app.ui.updateTemplateTypeahead('timeSpans')

			}
		},

		// apply change to input element
		updateRegulationInput: (e) =>{

			//on enter
			if (e.which === 13) {

				const text = e.target.value;
				const cRT = app.state.currentRegulationTarget

				// throw on name collision
				if (app.state.templates.regulations[text]) {
					alert('A template by this name already exists. Please choose a new one.')
					return
				}

				e.target.blur();

				// if editing a template
				if (cRT.template){

					const oldTemplateName = cRT.template;

					// copy template over and delete old template key
					app.state.templates.regulations[text] = app.state.templates.regulations[oldTemplateName] || [];
					delete app.state.templates.regulations[oldTemplateName];

					//change all references to old template, to new
					var oldData = app.ui.featuresList.getSourceData();

					oldData.forEach(row=>{
						if (row[4]===oldTemplateName) row[4] = text
					})

				}

				// if creating a template from inline
				else {

					//create new template with whatever's currently in the regulationslist
					app.state.templates.regulations[text] = app.ui.regulationsList.getSourceData()
					var oldData = app.ui.featuresList.getSourceData();

					const iFs = cRT.inlineFeatures
					if (iFs) for (var f=iFs[0]; f<=iFs[1]; f++) oldData[f][4] = text;
					else oldData[cRT.inlineFeature][4] = text;

				}

				console.log(oldData)
				app.ui.featuresList.loadData(oldData);
				// app.ui.featuresList.render();
				const newCRT = {template:text, rawRange:cRT.rawRange}
				app.setState('currentRegulationTarget', newCRT)
				app.ui.updateTemplateTypeahead('regulations')

			}
		},

		capFeatureSelection: (row, column, row2, column2, preventScrolling, selectionLayerLevel) => {
			app.state.cappingSelection = row < 0 || row2>=app.state.data.features.length;
			const fL = app.ui.featuresList;

			if (app.state.cappingSelection){
				console.log('busting cap')
				!app.state.cappingSelection;
				fL.selectCells(
					Math.max(row, 0),
					column,
					Math.min(row2, app.state.data.features.length-1),
					column2
				)
			}
		},

		// show the proper regulations scheme (either inline or templated)
		renderFeatureRegulations: (row, column, row2, column2, preventScrolling, selectionLayerLevel) => {
			if (app.state.cappingSelection) return

			const fL = app.ui.featuresList;
			var range = row === row2 ? row : [row, row2]
			if (range[1]<range[0]) range.reverse()

			var cRT = {visualRange:range};
			const singleRowSelected = row === row2;

			if (singleRowSelected) {
				const physicalRow = fL.toPhysicalRow(row);
				const templateName = fL.getSourceDataAtCell(physicalRow, 4);
				cRT.rawRange = physicalRow

				if (templateName) cRT.template = templateName
				else cRT.inlineFeature = physicalRow
			}

			else {
				cRT.inlineFeatures = [row, row2].map(row=>fL.toPhysicalRow(row))
				cRT.rawRange = [];
				for (var f=row; f<=row2; f++) cRT.rawRange.push(f)
			}

			
			app.setState('currentRegulationTarget', cRT)
		},

		updateTemplateTypeahead: (templateType)=>{

			// TODO: make this work for timespan templates		
			if (templateType ==='timeSpans') return
			const extantTemplates = Object.keys(app.state.templates[templateType]);

			const parentList = {
				regulations:'featuresList',
				timeSpans: 'regulationsList'
			}

			var defaultColumns = app.utils.clone(app.constants.ui.tableColumns[parentList[templateType]]);

			defaultColumns[defaultColumns.length-1] = {
				type: 'autocomplete',
				source: extantTemplates,
				className:' steelblue',
				placeholder: 'Unique values'
			}
			console.log(defaultColumns)
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

								if (cRT.inlineRegulation) app.state.raw.timeSpans[cRT.inlineRegulation][row] = oldTemplateContents
								
								else for (var s = cRT.inlineRegulations[0]; s<=cRT.inlineRegulations[1]; s++){
									app.state.raw.timeSpans[s][row] = oldTemplateContents
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
					else console.log('multiple template changes. need to handle?')
				
				})

			app.ui.updateTemplateTypeahead(templateType)
		}
	},

	utils: {
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

		properties: [
			'label',
			'sideOfStreet',
			'assetType',
			'assetSubtype'
		],

		ui: {
			tableColumns: {

				featuresList:[
					{},
					{
						type: 'dropdown',
						source: ['left', 'right', 'unknown'],
						strict: true,
						filter:true,
						visibleRows: 4
					},
					{
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
						type: 'autocomplete',
						readOnly: true,
						placeholder: 'NA',
						visibleRows: 20,
					},

					{
						type: 'text',
						className:' steelblue',
						placeholder: 'Unique values'
					}
				],

				regulationsList: [
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
					{
						data: 'payment',
						type: 'checkbox',
						width:60
					},	
					{data: 'userClasses'},
					{data: 'userSubClasses'},					
					{
						data: 'timeSpanTemplate',
						className:' maroon',
						placeholder: 'Unique values'
					}
				]
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
						color: 'maroon'
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
						color: 'maroon'
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
						color: 'maroon'
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
						color: 'maroon'
					}
				},
			],
			entryPropagations: {
				assetType: {
					destinationProp: 'assetSubtype',
					propagatingValues: {

						'pavement marking': {
							placeholder: 'Marking type',
							values: [
								'ramp', 
								'driveway', 
								'street'
							]
						},

						'curb cut': {
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
							placeholder: 'Paint color'
						},
					}					
				}
			},

			entryParams: [
				{
					param: 'shstRefId',
					placeholder: 'unique identifier',
					inputProp: 'shst_ref_id'
				},

				{
					param: 'sideOfStreet',
					placeholder: 'street side',
					inputProp: 'ref_side'
				},

				{
					param: 'shstLocationStart',
					placeholder: 'start of regulation',
					inputProp: 'dst_st'
				},			
				{
					param: 'shstLocationEnd',
					placeholder: 'end of regulation',
					inputProp: 'dst_end'
				},			
				{
					param: 'assetType'
				},
				{
					param: 'assetSubtype',
					defaultHidden: true
				}					

			],

			regulationParams: [
				{
					param: 'activity'
				},	
				{
					param: 'maxStay'
				},	
				{
					param: 'payment'
				},
				{
					param: 'userClasses',
					placeholder: 'Comma-delimited values'
				},
				{
					param: 'userSubClasses',
					placeholder: 'Comma-delimited values'
				},
				{
					param: 'timeSpanTemplate',
					placeholder: 'Unique value'
				}
			],

			timeSpanParams: [
				{
					param: 'daysOfWeek',
					placeholder: 'Comma-delimited values'
				},
				{
					param: 'timesOfDay',
					placeholder: 'Comma-delimited, each in HH:MM-HH:MM'				
				}
			]
		},


		validate: {

			shstRefId: {
				type: 'string',
				output: ['output', 'location']
			},

			sideOfStreet: {
				type: 'string',
				output: ['output', 'location'],
				oneOf: ['left', 'right', 'unknown'],
				allowCustomValues: false
			},

			shstLocationStart: {
				type: 'number',
				output: ['output', 'location'],
				transform: input => parseFloat(input)
			},	

			shstLocationEnd: {
				type: 'number',
				output: ['output', 'location'],
				transform: input => parseFloat(input)
			},	

			assetType: {
				type: 'string', 
				oneOf: [
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
				output: ['output', 'location'],
				allowCustomValues: false,
				subParameter: 'assetSubtype',

			},

			assetSubtype: {
				allowCustomValues: true,
				output: ['output', 'location'],
			},

			activity: {
				oneOf: [
					'standing', 
					'no standing', 
					'loading', 
					'no loading', 
					'parking', 
					'no parking'
				],
				allowCustomValues: false,
				output: ['rule']
			},
			
			maxStay: {
				type: 'number',
				oneOf: [5, 10, 15, 20, 30, 45, 60, 120, 180, 240, 300, 360, 480],
				allowCustomValues: false,
				output: ['rule']
			},

			payment: {
				type: 'number',
				oneOf: [false, true],
				allowCustomValues: false,
				output: ['rule']
			},

			userClasses: {
				oneOf: [
					'bicycle', 
					'bikeshare', 
					'bus', 
					'car share', 
					'carpool', 
					'commercial', 
					'compact', 
					'construction', 
					'diplomat', 
					'electric', 
					'emergency', 
					'food truck', 
					'handicap', 
					'micromobility', 
					'motorcycle', 
					'official', 
					'passenger', 
					'permit', 
					'police', 
					'rideshare', 
					'staff', 
					'student', 
					'taxi', 
					'truck', 
					'visitor'
				],
				output: ['rule'],
				allowCustomValues: true,
				transform: input => input.split(', ')
			},

			userSubClasses: {
				type: 'array',
				arrayMemberType: 'string',
				allowCustomValues: true,
				output: ['rule'],
				transform: input => input.split(', ')
			},

			daysOfWeek: {
				type: 'array',
				arrayMemberType:'string',
				allowCustomValues: false,
				inputType: 'text',
				oneOf: ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'],
				transform: input => input.split(', '),
				output: ['rule']
			},
			occurrencesInMonth: {
				type: 'array',
				arrayMemberType:'string',
				allowCustomValues: false,
				inputType: 'text',
				oneOf: ['1st', '2nd', '3rd', '4th', '5th', 'last'],
				transform: input => input.split(', '),
				output: ['rule']
			},
			timesOfDay: {
				type: 'array',
				arrayMemberType:'string',
				allowCustomValues: true,
				transform: (input)=>{
					var arr = input.split(', ')
						.map(period=>{
							var startEnd = period.split('-');
							return {
								start: startEnd[0],
								end: startEnd[1]
							}
						})

					return arr
				},
				output: ['rule']
			}
		},

		timeSpansCollapsingScheme: [
			{row: -3, col: 2, collapsible: true}
		],
		regulation: {

		}
	},
}


	