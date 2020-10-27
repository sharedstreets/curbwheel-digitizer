### Data and UI structure

The data is a nested scheme consisting of a set of **spans**, each with a set of **regulations**, each with a set of **timespans**. These are represented as three separate spreadsheets in the interface. Going into the nested structure, we’ll call each successive set a *child*, and going out of the nest they are *parents*.

As grandparent, the spans set is fixed, and behaves like a traditional spreadsheet. However, the other two sets display data **contextually specific** to their currently-selected ancestors. 

- Editing a set of regulations requires first selecting the proper span, and editing timespans requires selecting a regulation as well. We'll call this *inline* editing, as the change is limited to specific selections.
- The **heading** of each set indicates the current parents targeted. This helps ensure that we’re working with data for the intended parent (instead of an inadvertent uncle).

### Templates

Many spans share an identical regulations scheme, as regulations do with timespans. **Templates** let us tag whole sets of children under memorable names, and apply them to other parents. We can even tweak that child set in the future by referring to the template name, without chasing down and updating every parent in the original selection.

Spans can invoke `regulationTemplate`s, and regulations have `timeSpanTemplates`s; they work identically in their respective scopes, so we'll illustrate with the former:

- To **make** a template, select a span and enter a new name for its `regulationTemplate`. The span will take on the template immediately -- if it had existing regulation data (either inline or from a previous template), the new template will inherit them as well.

- Other spans can **subscribe** to the template, by invoking the same name. All subscribing spans will take on the template’s list of regulations.

- Find and **edit** a template's contents by selecting a subscribing span. Changes to a template will propagate to all other subscribers.

- **Unsubscribe** a span from a template, by changing that `regulationTemplate` reference. Depending on the new reference, it can
	- subscribe to another template, by invoking that name
	- make a new, identical template and subscribe to that, by entering a new name (this essentially takes us back to the first bullet)
	- unsubscribe from _all_ templates, by clearing the template field entirely. The span inherits the old template contents as inline regulations, though future updates to the template will not propagate to the span.

### Shortcuts and caveats

- The regulation and timespan sections each have an input. Depending on the current selection, it can promote inline data to a template, or rename the existing template.

- Invoking a nonexistent template will automatically create it, prepopulated with the referrer's existing child data. This means we can create multiple similar templates by subscribing to one, immediately switching to a new template name, and tweaking it from there. 

- Templates exist **only in the digitizer**, to facilitate data entry. Imported surveys don't come with any, nor will the exported CurbLR preserve them. This means digitizers making heavy use of templates will export a verbose, highly repetitive CurbLR once it eliminates the references. 