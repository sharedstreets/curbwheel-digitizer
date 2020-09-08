const express = require('express')
const app = express();
const fs = require('fs');
var path = require('path');

app.use("/src", express.static(path.join(__dirname, "/src")));

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname + '/'));
});

app.listen(8000, () => {
  console.log('Example app listening on port 8000!')
});