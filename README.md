# curblr-digitizer

### installation

`npm install`

`npm start`

### importing surveys

To import a survey, append the url with `?survey=<surveyPath>`, where `<surveyPath>` is the URL to the survey. At this path, it anticipates a file structure resembling [this sample survey](https://github.com/sharedstreets/curblr-digitizer/tree/master/src/sampleSurvey), with a `points.json`, `spans.json`, and `images` folder.

see [usage.md](https://github.com/sharedstreets/curblr-digitizer/blob/master/usage.md) for UI documentation.

### backups

The digitizer saves the current state of digitization at 5-second intervals to the browser's `localStorage`. Under the hood, it clones the current state and stores it under a key defined by the `surveyPath` above. If the digitizer initiates with a `surveyPath` matching one in the cache, it will prompt the user with an option to resume the previous session, before importing the survey anew.

`localStorage` is somewhat unpredictable and browsers purge it regularly, so this is meant to be a backup rather than a reliable storage method.
