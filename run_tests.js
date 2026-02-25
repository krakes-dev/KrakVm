const { build } = require('./src/index.js');
const fs = require('fs');
const { execSync } = require('child_process');

console.log("Compiling bitwise.test.js...");
var out = build('./tests/bitwise.test.js', './tests/bitwise.protected.js');
console.log(out.config);
console.log("Running protected bitwise test...");
try {
    let out = execSync('node ./tests/bitwise.protected.js');
    console.log(out.toString());
} catch (e) {
    console.error("Failed!", e.message);
}
