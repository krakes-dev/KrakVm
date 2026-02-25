const fs = require('fs');
const path = require('path');
const { generateVMScript } = require('./compiler/generator.js');
const { compileFile } = require('./compiler/compiler.js');
const { obfuscate } = require('./obfuscator/obfuscate.js');

function generateRandomId() {
    return 'vm_' + Math.random().toString(36).substring(2, 10);
}

function build(input, outputPath, obfuscatee = true) {
    var vmName = generateRandomId();

    console.log('=== KrakVM Build ===\n');

    console.log('[1/4] Generating unique VM...');
    var gen = generateVMScript(vmName);
    console.log('  VM Script:', gen.vmPath);
    console.log('  Config:', gen.configPath);

    var vmCode = fs.readFileSync(gen.vmPath, 'utf8');
    var config = JSON.parse(fs.readFileSync(gen.configPath, 'utf8'));

    if (obfuscatee) {
        console.log('\n[2/4] Obfuscating VM & Dynamic Opcodes...');
        vmCode = vmCode.replace(/module\.exports\s*=\s*\{[^}]*\};?/g, '');
        var obfResult = obfuscate(vmCode, ['runVM'], config.dynamicOps);
        if (typeof obfResult === 'string') {
            vmCode = obfResult;
        } else {
            vmCode = obfResult.code;
            config.dynamicOps = obfResult.dynamicOps;
        }
        console.log('  Obfuscated VM size:', vmCode.length, 'chars');
    } else {
        console.log('\n[2/4] Skipping obfuscation...');
        vmCode = vmCode.replace(/module\.exports\s*=\s*\{[^}]*\};?/g, '');
    }

    console.log('\n[3/4] Compiling JavaScript...');
    var compiled = compileFile(input, config);
    console.log('  Bytecode size:', compiled.bytecode.length, 'bytes');

    console.log('\n[4/4] Building output script...');

    var outputCode = `// KrakVM Protected Script
// Generated: ${new Date().toISOString()}

(function() {
var __krak_throw = function(e) { throw e; };
if (typeof globalThis !== 'undefined') globalThis.__krak_throw = __krak_throw;
else if (typeof window !== 'undefined') window.__krak_throw = __krak_throw;
else if (typeof global !== 'undefined') global.__krak_throw = __krak_throw;

${vmCode}

var bytecode = "${compiled.base64}";

runVM(bytecode);
})();`;

    if (!outputPath) {
        outputPath = input.replace('.js', '.protected.js');
    }

    fs.writeFileSync(outputPath, outputCode);

    fs.unlinkSync(gen.vmPath);
    fs.unlinkSync(gen.configPath);

    console.log('\n=== Build Complete ===');
    console.log('Output:', outputPath);
    console.log('Size:', outputCode.length, 'bytes');

    return {
        outputPath: outputPath,
        bytecodeSize: compiled.bytecode.length,
        config: config
    };
}

module.exports = { build };
