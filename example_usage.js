const { build } = require('./src/index.js');

build('bench/fingerprint.js', "script.protected.js", true);
