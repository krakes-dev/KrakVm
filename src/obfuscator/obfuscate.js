var acorn = require('acorn');
var estraverse = require('estraverse');
var { generate } = require('astring');
var UglifyJS = require('uglify-js');
var RESERVED = new Set([
    'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',
    'arguments', 'this', 'eval', 'console', 'window', 'global', 'globalThis',
    'require', 'module', 'exports', '__dirname', '__filename',
    'process', 'Buffer', 'setTimeout', 'setInterval', 'clearTimeout',
    'clearInterval', 'Date', 'Math', 'JSON', 'String', 'Number',
    'Boolean', 'Array', 'Object', 'Function', 'Error', 'TypeError',
    'RegExp', 'Map', 'Set', 'Promise', 'Symbol', 'Proxy', 'Reflect',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
    'decodeURIComponent', 'encodeURI', 'decodeURI', 'atob', 'btoa',
    'Uint8Array', 'Int32Array', 'Float64Array', 'ArrayBuffer',
    'DataView', 'WeakMap', 'WeakSet',
    'var', 'let', 'const', 'function', 'return', 'if', 'else',
    'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'new', 'delete', 'typeof', 'instanceof', 'in', 'throw', 'try',
    'catch', 'finally', 'class', 'extends', 'super', 'yield',
    'async', 'await', 'import', 'export', 'default', 'void', 'with',
    'debugger', 'of'
]);
var generatedHexIds = new Set();
function genHexId(idx) {
    var hex;
    do {
        hex = '_0x' + Math.floor(Math.random() * 0xFFFFFF).toString(16);
    } while (generatedHexIds.has(hex) || RESERVED.has(hex));
    generatedHexIds.add(hex);
    return hex;
}
function shuffleArray(array) {
    var copy = array.slice();
    for (var i = copy.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = copy[i];
        copy[i] = copy[j];
        copy[j] = temp;
    }
    return copy;
}
function generateStringCodec(codecName) {
    var b64_std = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var alphabet = shuffleArray(b64_std.split('')).join('');

    var splitIdx = 28 + Math.floor(Math.random() * 8);
    var alphaA = alphabet.substring(0, splitIdx);
    var alphaB = alphabet.substring(splitIdx);

    var alphaAVar = genHexId();
    var alphaBVar = genHexId();
    var paramsVar = genHexId();

    var lcgSeed = Math.floor(Math.random() * 0x7FFFFFFF);
    var lcgA = Math.floor(Math.random() * 0xFFFFFF) | 1;
    var lcgC = Math.floor(Math.random() * 0xFFFFFF) | 1;

    var operations = [];
    var numOps = Math.floor(Math.random() * 6) + 3;
    operations.push({ type: ['KEY_XOR', 'KEY_ADD', 'KEY_SUB'][Math.floor(Math.random() * 3)] });
    for (var i = 0; i < numOps; i++) {
        operations.push({
            type: ['ADD', 'SUB', 'XOR', 'NOT', 'KEY_XOR', 'KEY_ADD', 'KEY_SUB'][Math.floor(Math.random() * 7)],
            val: Math.floor(Math.random() * 256)
        });
    }
    operations = shuffleArray(operations);

    var saltMul = (Math.floor(Math.random() * 126) + 1) * 2 + 1;
    var saltAdd = Math.floor(Math.random() * 256);
    var siteCounter = 0;

    function encodeStr(str, salt) {
        var utf8 = unescape(encodeURIComponent(str));
        var bytes = [];
        for (var i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));

        var encBytes = [];
        var state = lcgSeed;
        for (var k = 0; k < bytes.length; k++) {
            state = Math.imul(state, lcgA) + lcgC | 0;
            var keyByte = (state >>> 16) & 255;
            var v = bytes[k];
            v = (v ^ ((Math.imul(salt, saltMul) + k * saltAdd) & 0xFF)) & 0xFF;
            for (var o = 0; o < operations.length; o++) {
                var op = operations[o];
                if (op.type === 'ADD') v = (v + op.val) & 0xFF;
                else if (op.type === 'SUB') v = (v - op.val) & 0xFF;
                else if (op.type === 'XOR') v = (v ^ op.val) & 0xFF;
                else if (op.type === 'NOT') v = (~v) & 0xFF;
                else if (op.type === 'KEY_XOR') v = (v ^ keyByte) & 0xFF;
                else if (op.type === 'KEY_ADD') v = (v + keyByte) & 0xFF;
                else if (op.type === 'KEY_SUB') v = (v - keyByte) & 0xFF;
            }
            encBytes.push(v);
        }

        var b64str = "";
        for (var n = 0; n < encBytes.length; n += 3) {
            var b1 = encBytes[n];
            var b2 = n + 1 < encBytes.length ? encBytes[n + 1] : 0;
            var b3 = n + 2 < encBytes.length ? encBytes[n + 2] : 0;
            var enc1 = b1 >> 2;
            var enc2 = ((b1 & 3) << 4) | (b2 >> 4);
            var enc3 = ((b2 & 15) << 2) | (b3 >> 6);
            var enc4 = b3 & 63;
            if (n + 1 >= encBytes.length) enc3 = enc4 = 64;
            else if (n + 2 >= encBytes.length) enc4 = 64;
            b64str += alphabet.charAt(enc1) + alphabet.charAt(enc2) + (enc3 === 64 ? "=" : alphabet.charAt(enc3)) + (enc4 === 64 ? "=" : alphabet.charAt(enc4));
        }
        return b64str;
    }

    var decoderOps = "";
    for (var o = operations.length - 1; o >= 0; o--) {
        var op = operations[o];
        if (op.type === 'ADD') decoderOps += `                v = (v - ${op.val}) & 0xFF;\n`;
        else if (op.type === 'SUB') decoderOps += `                v = (v + ${op.val}) & 0xFF;\n`;
        else if (op.type === 'XOR') decoderOps += `                v = (v ^ ${op.val}) & 0xFF;\n`;
        else if (op.type === 'NOT') decoderOps += `                v = (~v) & 0xFF;\n`;
        else if (op.type === 'KEY_XOR') decoderOps += `                v = (v ^ keyByte) & 0xFF;\n`;
        else if (op.type === 'KEY_ADD') decoderOps += `                v = (v - keyByte) & 0xFF;\n`;
        else if (op.type === 'KEY_SUB') decoderOps += `                v = (v + keyByte) & 0xFF;\n`;
    }

    var _c = genHexId(), _s = genHexId(), _k = genHexId(), _a = genHexId();
    var _b = genHexId(), _i = genHexId(), _e1 = genHexId(), _e2 = genHexId();
    var _c3 = genHexId(), _e3 = genHexId(), _c4 = genHexId(), _e4 = genHexId();
    var _p = genHexId(), _st = genHexId(), _r = genHexId(), _y = genHexId();
    var _kb = genHexId(), _v = genHexId(), _sr = genHexId(), _fs = genHexId();

    decoderOps = decoderOps.replace(/keyByte/g, _kb).replace(/\bv\b/g, _v);

    var decoderTemplate = `
    var ${codecName} = (function() {
        var ${_c} = {};
        return function(${_s}, ${_k}) {
            if (${_c}[${_s}]) return ${_c}[${_s}];
            var ${_a} = ${alphaAVar} + ${alphaBVar};
            var ${_b} = [];
            for (var ${_i} = 0; ${_i} < ${_s}.length; ) {
                var ${_e1} = ${_a}.indexOf(${_s}.charAt(${_i}++));
                var ${_e2} = ${_a}.indexOf(${_s}.charAt(${_i}++));
                var ${_c3} = ${_s}.charAt(${_i}++);
                var ${_e3} = ${_c3} === '=' ? 64 : ${_a}.indexOf(${_c3});
                var ${_c4} = ${_s}.charAt(${_i}++);
                var ${_e4} = ${_c4} === '=' ? 64 : ${_a}.indexOf(${_c4});
                ${_b}.push((${_e1} << 2) | (${_e2} >> 4));
                if (${_e3} !== 64) ${_b}.push(((${_e2} & 15) << 4) | (${_e3} >> 2));
                if (${_e4} !== 64) ${_b}.push(((${_e3} & 3) << 6) | ${_e4});
            }
            var ${_p} = ${paramsVar};
            var ${_st} = ${_p}[0];
            var ${_r} = [];
            for (var ${_y} = 0; ${_y} < ${_b}.length; ${_y}++) {
                ${_st} = Math.imul(${_st}, ${_p}[1]) + ${_p}[2] | 0;
                var ${_kb} = (${_st} >>> 16) & 255;
                var ${_v} = ${_b}[${_y}];
${decoderOps}
                ${_v} = (${_v} ^ ((Math.imul(${_k}, ${saltMul}) + ${_y} * ${saltAdd}) & 0xFF)) & 0xFF;
                ${_r}.push(${_v});
            }
            var ${_sr} = '';
            for (var ${_y} = 0; ${_y} < ${_r}.length; ${_y}++) ${_sr} += '%' + ('00' + ${_r}[${_y}].toString(16)).slice(-2);
            var ${_fs} = decodeURIComponent(${_sr});
            ${_c}[${_s}] = ${_fs};
            return ${_fs};
        };
    })();
    `;

    var decoderAst = acorn.parse(decoderTemplate, { ecmaVersion: 2020 }).body[0];

    var scatteredAsts = [
        acorn.parse(`var ${alphaAVar} = "${alphaA}";`, { ecmaVersion: 2020 }).body[0],
        acorn.parse(`var ${alphaBVar} = "${alphaB}";`, { ecmaVersion: 2020 }).body[0],
        acorn.parse(`var ${paramsVar} = [${lcgSeed}, ${lcgA}, ${lcgC}];`, { ecmaVersion: 2020 }).body[0]
    ];

    return {
        encodeAst: function (str) {
            var salt = siteCounter++;
            var encoded = encodeStr(str, salt);
            return {
                type: 'ArrayExpression',
                elements: [
                    { type: 'Literal', value: encoded },
                    { type: 'Literal', value: salt }
                ]
            };
        },
        decoderAst: decoderAst,
        scatteredAsts: scatteredAsts
    };
}
function obfuscate(code, preserve, dynamicOpsObj) {
    var ast;
    try {
        ast = acorn.parse(code, { ecmaVersion: 2020 });
    } catch (e) {
        console.error("Parse Error during Obfuscation: ", e.message);
        return code;
    }
    var preserveSet = new Set(preserve || []);
    var dynKeys = dynamicOpsObj ? Object.keys(dynamicOpsObj) : [];
    dynKeys.forEach(k => {
        var dynAst = acorn.parse("function __DYN_" + k + "() { " + dynamicOpsObj[k].src + " }", { ecmaVersion: 2020 });
        ast.body.push(dynAst.body[0]);
    });
    var nameIdx = 0;
    var codecName = genHexId(nameIdx++);
    var codecData = generateStringCodec(codecName);
    ast = estraverse.replace(ast, {
        leave: function (node, parent) {
            if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
                if (node.property.name.length <= 4) return node;
                if (Math.random() < 0.5) return node;

                var encodedAst = codecData.encodeAst(node.property.name);
                return {
                    type: 'MemberExpression',
                    computed: true,
                    object: node.object,
                    property: {
                        type: 'CallExpression',
                        callee: { type: 'Identifier', name: codecName },
                        arguments: encodedAst.elements
                    }
                };
            }
            if (node.type === 'Literal' && typeof node.value === 'string') {
                if (node.value.length <= 4 || Math.random() < 0.5) return node;
                if (parent && parent.type === 'Property' && parent.key === node && !parent.computed) return node;
                var encodedAst = codecData.encodeAst(node.value);
                return {
                    type: 'CallExpression',
                    callee: { type: 'Identifier', name: codecName },
                    arguments: encodedAst.elements
                };
            }
        }
    });
    var usageCounts = new Map();
    var varDecls = new Map();
    var validScope = new Map();
    estraverse.traverse(ast, {
        enter: function (node, parent) {
            if (node.type === 'Identifier') {
                if (parent.type === 'MemberExpression' && !parent.computed && parent.property === node) return;
                if (parent.type === 'Property' && !parent.computed && parent.key === node) return;
                var name = node.name;
                if (!(parent.type === 'VariableDeclarator' && parent.id === node) &&
                    !(parent.type === 'FunctionDeclaration' && parent.id === node)) {
                    usageCounts.set(name, (usageCounts.get(name) || 0) + 1);
                }
            }
            if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init && node.init.type !== 'FunctionExpression') {
                var name = node.id.name;
                if (node.init.type === 'Literal' || node.init.type === 'Identifier' || node.init.type === 'MemberExpression') {
                    varDecls.set(name, node.init);
                }
            }
            if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') varDecls.delete(node.left.name);
            if (node.type === 'UpdateExpression' && node.argument.type === 'Identifier') varDecls.delete(node.argument.name);
        }
    });
    ast = estraverse.replace(ast, {
        leave: function (node, parent) {
            if (node.type === 'Identifier') {
                if (parent.type === 'MemberExpression' && !parent.computed && parent.property === node) return node;
                if (parent.type === 'Property' && !parent.computed && parent.key === node) return node;
                if (parent.type === 'VariableDeclarator' && parent.id === node) return node;
                var name = node.name;
                if (varDecls.has(name) && usageCounts.get(name) === 1 && Math.random() < 0.8) {
                    var foldedInit = varDecls.get(name);
                    validScope.set(name, true);
                    return foldedInit;
                }
            }
        }
    });
    ast = estraverse.replace(ast, {
        leave: function (node, parent) {
            if (node.type === 'VariableDeclaration') {
                var newDecls = node.declarations.filter(d => {
                    if (d.id.type === 'Identifier' && validScope.has(d.id.name)) return false;
                    return true;
                });
                if (newDecls.length === 0) return this.remove();
                node.declarations = newDecls;
                return node;
            }
        }
    });

    var renameMap = {};
    estraverse.traverse(ast, {
        enter: function (node, parent) {
            if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
                renameMap[node.id.name] = true;
            } else if (node.type === 'FunctionDeclaration' && node.id) {
                renameMap[node.id.name] = true;
                node.params.forEach(p => { if (p.type === 'Identifier') renameMap[p.name] = true; });
            } else if (node.type === 'FunctionExpression' && node.id) {
                renameMap[node.id.name] = true;
                node.params.forEach(p => { if (p.type === 'Identifier') renameMap[p.name] = true; });
            }
            if (node.type === 'CatchClause' && node.param && node.param.type === 'Identifier') {
                renameMap[node.param.name] = true;
            }
        }
    });
    Object.keys(renameMap).forEach(name => {
        if (!RESERVED.has(name) && !preserveSet.has(name) && !name.startsWith('__DYN_') && name !== codecName) {
            renameMap[name] = genHexId(nameIdx++);
        } else {
            delete renameMap[name];
        }
    });
    ast = estraverse.replace(ast, {
        leave: function (node, parent) {
            if (node.type === 'Identifier' && renameMap[node.name]) {
                if (parent && parent.type === 'MemberExpression' && !parent.computed && parent.property === node) return node;
                if (parent && parent.type === 'Property' && !parent.computed && parent.key === node) return node;
                return { type: 'Identifier', name: renameMap[node.name] };
            }
        }
    });
    var obfDynamicOpsObj = {};
    if (dynKeys.length > 0) {
        var newBody = [];
        for (var i = 0; i < ast.body.length; i++) {
            var n = ast.body[i];
            if (n.type === 'FunctionDeclaration' && n.id && n.id.name.startsWith('__DYN_')) {
                var k = n.id.name.substring(6);
                var bodyObf = n.body.body.map(stmt => generate(stmt, { format: { indent: { style: '' }, space: '' } })).join('');
                var minBody = UglifyJS.minify(bodyObf);
                var finalBody = (!minBody.error && minBody.code) ? minBody.code : bodyObf;
                obfDynamicOpsObj[k] = {
                    opcodeVal: dynamicOpsObj[k].opcodeVal,
                    src: finalBody
                };
            } else {
                newBody.push(n);
            }
        }
        ast.body = newBody;
    }
    ast.body.unshift(codecData.decoderAst);
    var scatterNodes = shuffleArray(codecData.scatteredAsts);
    for (var si = 0; si < scatterNodes.length; si++) {
        ast.body.splice(1 + si, 0, scatterNodes[si]);
    }
    var obfCode = generate(ast, { format: { indent: { style: '' }, space: '' } });
    var minified = UglifyJS.minify(obfCode);
    if (!minified.error && minified.code) {
        obfCode = minified.code;
    }
    if (dynKeys.length > 0) return { code: obfCode, dynamicOps: obfDynamicOpsObj };
    return obfCode;
}
module.exports = { obfuscate };
