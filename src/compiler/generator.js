const fs = require('fs');
const path = require('path');

const VM_TEMPLATE_PATH = path.join(__dirname, '../vm/core.js');
const OUTPUT_DIR = path.join(__dirname, '../generated');

function shuffle(arr) {
    var out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = out[i];
        out[i] = out[j];
        out[j] = t;
    }
    return out;
}

function uniqueOpcodes(n) {
    var buf = [];
    for (var i = 0; i < 256; i++) buf.push(i);
    return shuffle(buf).slice(0, n);
}

function argName(line) {
    var m = line.match(/var\s+(\w+)\s*=/);
    return m ? m[1] : null;
}

function argType(line) {
    if (line.includes('readInt32()')) return 'INT';
    if (line.includes('readByte()')) return 'BYTE';
    if (line.includes('readStr()')) return 'STRING';
    return null;
}

function shuffleFetchBlocks(src) {
    var lines = src.split('\n');
    var out = [];
    var inBlock = false;
    var block = [];
    var curHandler = null;
    var layouts = {};

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var hm = line.match(/function\s+(\w+)\s*\(/);
        if (hm) curHandler = hm[1];

        if (line.includes('@FETCH_START')) {
            inBlock = true;
            out.push(line);
            block = [];
        } else if (line.includes('@FETCH_END')) {
            inBlock = false;
            var shuf = shuffle(block);
            if (curHandler) {
                var layout = [];
                for (var j = 0; j < shuf.length; j++) {
                    var n = argName(shuf[j]), ty = argType(shuf[j]);
                    if (n && ty) layout.push({ name: n, type: ty });
                }
                layouts[curHandler] = layout;
            }
            for (var j = 0; j < shuf.length; j++) out.push(shuf[j]);
            out.push(line);
        } else if (inBlock) {
            block.push(line);
        } else {
            out.push(line);
        }
    }
    return { code: out.join('\n'), argLayouts: layouts };
}

var OPCODE_NAMES = [
    'MOV', 'MOVR', 'ADD', 'SUB', 'MUL', 'DIV', 'MOD',
    'NOR', 'XOR', 'AND', 'OR', 'NOT', 'SHL', 'SHR',
    'LOAD', 'STORE', 'CMP', 'INC', 'DEC', 'JMP', 'JZ',
    'JNZ', 'JLT', 'JGT', 'PUSH', 'POP', 'CALLI', 'CALLE', 'RET',
    'OUT', 'HALT', 'STR', 'GGLO', 'GPRP', 'SPRP', 'METH',
    'TNUM', 'FNUM', 'CADR', 'NEW', 'IOF', 'CREGI', 'CREGE', 'TYP',
    'BOOL', 'FUNC', 'SAR', 'EVAL'
];

var HANDLER_MAP = {
    'mov': 'MOV',
    'movr': 'MOVR',
    'add': 'ADD',
    'sub': 'SUB',
    'mul': 'MUL',
    'div': 'DIV',
    'mod': 'MOD',
    'nor': 'NOR',
    'xor': 'XOR',
    'and': 'AND',
    'or': 'OR',
    'not': 'NOT',
    'shl': 'SHL',
    'shr': 'SHR',
    'load': 'LOAD',
    'store': 'STORE',
    'cmp': 'CMP',
    'inc': 'INC',
    'dec': 'DEC',
    'jmp': 'JMP',
    'jz': 'JZ',
    'jnz': 'JNZ',
    'jlt': 'JLT',
    'jgt': 'JGT',
    'push': 'PUSH',
    'pop': 'POP',
    'calli': 'CALLI',
    'calle': 'CALLE',
    'ret': 'RET',
    'out': 'OUT',
    'halt': 'HALT',
    'str': 'STR',
    'getGlobal': 'GGLO',
    'getProp': 'GPRP',
    'setProp': 'SPRP',
    'callMethod': 'METH',
    'toNum': 'TNUM',
    'fromNum': 'FNUM',
    'callAddr': 'CADR',
    'newObject': 'NEW',
    'instanceOf': 'IOF',
    'callRegInternal': 'CREGI',
    'callRegExternal': 'CREGE',
    'typeOf': 'TYP',
    'toBool': 'BOOL',
    'newFunc': 'FUNC',
    'shiftRightArith': 'SAR',
    '_eval': 'EVAL'
};



function randKey() {
    return Math.floor(Math.random() * 256);
}

function generateCtxInit(key) {
    var keyStr;
    var r = Math.random();
    if (r < 0.33) {
        var add = Math.floor(Math.random() * 100000);
        keyStr = '(' + (key - add) + ' + ' + add + ')';
    } else if (r < 0.66) {
        var sub = Math.floor(Math.random() * 100000);
        keyStr = '(' + (key + sub) + ' - ' + sub + ')';
    } else {
        keyStr = key.toString();
    }

    var props = [
        ['reg', 'new Array(256).fill(0)'],
        ['mem', 'null'],
        ['ip', '0'],
        ['xk', keyStr],
        ['heap', 'new Array(65536).fill(0)'],
        ['stack', '[]'],
        ['frames', '[]'],
        ['env', "(typeof window !== 'undefined') ? window : global"]
    ];

    var isObjectLiteral = Math.random() < 0.5;
    var out = '';

    if (isObjectLiteral) {
        props = shuffle(props);
        var lines = props.map(function (p) { return p[0] + ': ' + p[1]; });
        out = 'var ctx = {\n    ' + lines.join(',\n    ') + '\n};';
    } else {
        props = shuffle(props);
        var lines = props.map(function (p) { return 'ctx.' + p[0] + ' = ' + p[1] + ';'; });
        out = 'var ctx = {};\n' + lines.join('\n');
    }
    return { initCode: out, keyStr: keyStr };
}

function randOddInt32() {
    var v = (Math.floor(Math.random() * 0x7FFFFFFF) * 2 + 1) >>> 0;
    return v;
}

function mathScramble(val) {
    if (Math.random() < 0.5) {
        var add = Math.floor(Math.random() * 500000);
        return '(' + (val - add) + ' + ' + add + ')';
    } else {
        var sub = Math.floor(Math.random() * 500000);
        return '(' + (val + sub) + ' - ' + sub + ')';
    }
}

function generateErrorArray() {
    var msgs = [
        "Memory Exhausted " + Math.random().toString(36).substr(2, 4),
        "Stack Bounds Exceeded " + Math.random().toString(36).substr(2, 4),
        "Illegal Instruction " + Math.random().toString(36).substr(2, 4),
        "Access Violation " + Math.random().toString(36).substr(2, 4)
    ];
    var arrs = msgs.map(function (m) {
        return '[' + m.split('').map(function (c) { return '0x' + c.charCodeAt(0).toString(16); }).join(', ') + ']';
    });

    if (Math.random() < 0.5) {
        return 'var _err = [\n    ' + arrs.join(',\n    ') + '\n];';
    } else {
        return 'var _err = [];\n' + arrs.map(function (a) { return '_err.push(' + a + ');'; }).join('\n');
    }
}

function generateConsts(mul, inc) {
    var stack = 100000 + Math.floor(Math.random() * 50000);
    var frames = 10000 + Math.floor(Math.random() * 5000);
    var lines = [
        'var MAX_STACK = ' + mathScramble(stack) + ';',
        'var MAX_FRAMES = ' + mathScramble(frames) + ';',
        'var LCG_MUL = ' + mathScramble(mul) + ';',
        'var LCG_INC = ' + mathScramble(inc) + ';'
    ];
    return shuffle(lines).join('\n');
}

var SAFE_INLINE = new Set([
    'mov', 'movr', 'add', 'sub', 'mul', 'div', 'mod', 'nor', 'xor', 'and', 'or', 'shl', 'shr', 'sar', 'inc', 'dec', 'push', 'pop', 'str'
]);
function removeMarkers(code, handlerName) {
    var lines = code.split('\n');
    var fetchLines = [];
    var preFetch = [];
    var postFetch = [];
    var state = 0; // 0=pre, 1=fetch, 2=post

    for (var i = 0; i < lines.length; i++) {
        var cleanedLine = lines[i].replace(/\r$/, '');
        if (cleanedLine.includes('@FETCH_START')) {
            state = 1;
        } else if (cleanedLine.includes('@FETCH_END')) {
            state = 2;
        } else if (state === 0) {
            preFetch.push(cleanedLine);
        } else if (state === 1) {
            fetchLines.push(cleanedLine);
        } else if (state === 2) {
            postFetch.push(cleanedLine);
        }
    }

    // Dynamically inline ONLY the *last* fetched variable if it is used exactly once.
    // This perfectly preserves the evaluation order of fetchByte() calls since
    // Javascript evaluates LHS to RHS, meaning the last fetch textually becomes the
    // last fetch executing. We CANNOT use a while loop to fold multiple, or their
    // execution order would align with their usage order, destroying bytecode alignments.
    if (SAFE_INLINE.has(handlerName) && fetchLines.length > 0 && Math.random() < 0.8) {
        var lastFetch = fetchLines[fetchLines.length - 1];
        var m = lastFetch.match(/var\s+(\w+)\s*=\s*(read\w+\(\));/);
        if (m) {
            var varName = m[1];
            var fetchCall = m[2];

            var regex = new RegExp('\\b' + varName + '\\b', 'g');
            var postStr = postFetch.join('\n');
            var matches = postStr.match(regex);

            if (matches && matches.length === 1) {
                postFetch = postStr.replace(regex, fetchCall).split('\n');
                fetchLines.pop();
            }
        }
    }

    var result = preFetch.concat(fetchLines).concat(postFetch);
    return result.join('\n');
}

var HANDLER_TO_OPCODE = {}; // Kept minimal for potential future use or delete fully.
// actually deleting fully is cleaner




const HANDLERS_PATH = path.join(__dirname, '../vm/handlers.js');

function generateVMScript(outputName) {
    var src = fs.readFileSync(VM_TEMPLATE_PATH, 'utf8');
    var handlersSrc = fs.readFileSync(HANDLERS_PATH, 'utf8');

    var opcodeVals = uniqueOpcodes(OPCODE_NAMES.length);
    var key = randKey();
    var lcgMul = randOddInt32();
    var lcgInc = randOddInt32();

    function applyASTPolymorphism(src) {
        if (Math.random() < 0.5) src = src.replace(/\(raw \^ ctx\.xk\)/g, '(ctx.xk ^ raw)');
        else src = src.replace(/\(raw \^ ctx\.xk\)/g, '(~(~raw ^ ctx.xk))');

        if (Math.random() < 0.5) src = src.replace(/\(m\[p\] \^ k\)/g, '(k ^ m[p])');
        else src = src.replace(/\(m\[p\] \^ k\)/g, '(~(~k ^ m[p]))');

        if (Math.random() < 0.5) src = src.replace(/if \(ctx\.ip >= ctx\.mem\.length\)/g, 'if (ctx.mem.length <= ctx.ip)');
        if (Math.random() < 0.5) src = src.replace(/if \(p \+ 4 > m\.length\)/g, 'if (m.length < p + 4)');

        if (Math.random() < 0.5) src = src.replace(/while \(ctx\.ip < l\)/g, 'for (; ctx.ip < l ;)');
        if (Math.random() < 0.5) src = src.replace(/if \(\!h\)/g, 'if (h === undefined)');
        if (Math.random() < 0.5) src = src.replace(/if \(\+\+c >= max\)/g, 'c++; if (c >= max)');

        return src;
    }

    var code = src;
    code = code.replace(/\/\/\s*@INJECT_ERR_START[\s\S]*?\/\/\s*@INJECT_ERR_END/, generateErrorArray());
    code = code.replace(/\/\/\s*@INJECT_CONSTS_START[\s\S]*?\/\/\s*@INJECT_CONSTS_END/, generateConsts(lcgMul, lcgInc));
    var ctxData = generateCtxInit(key);
    code = code.replace(/\/\/\s*@INJECT_CTX_START[\s\S]*?\/\/\s*@INJECT_CTX_END/, ctxData.initCode);
    code = code.replace(/\/\/\s*@INJECT_INIT_XK/g, 'ctx.xk = ' + ctxData.keyStr + ';');
    code = applyASTPolymorphism(code);

    var ctxProps = ['reg', 'mem', 'heap', 'stack', 'frames', 'env', 'ip', 'xk'];
    var ctxPropMap = {};
    ctxProps.forEach(function (p) {
        var hex;
        do { hex = '_' + Math.floor(Math.random() * 0xFFFFFF).toString(16); } while (Object.values(ctxPropMap).indexOf(hex) !== -1);
        ctxPropMap[p] = hex;
    });

    function renameCtxProps(src) {
        ctxProps.forEach(function (p) {
            src = src.replace(new RegExp('\\.' + p + '\\b', 'g'), '.' + ctxPropMap[p]);
            src = src.replace(new RegExp("'" + p + "'", 'g'), "'" + ctxPropMap[p] + "'");
            src = src.replace(new RegExp('"' + p + '"', 'g'), '"' + ctxPropMap[p] + '"');
            src = src.replace(new RegExp('\\b' + p + ':', 'g'), ctxPropMap[p] + ':');
        });
        return src;
    }

    code = renameCtxProps(code);

    // We shuffle the handlers file to get layout config
    var res = shuffleFetchBlocks(handlersSrc);
    var rawLayouts = res.argLayouts;
    res.code = applyASTPolymorphism(res.code);
    res.code = renameCtxProps(res.code);

    // Convert the shuffled handlers code back into functions so we can encrypt them
    var handlerBlocks = {};
    var currentHandler = null;
    var currentBlock = [];
    var lines = res.code.split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var hm = line.match(/^function\s+(\w+)\s*\(/);
        if (hm) {
            if (currentHandler) {
                handlerBlocks[currentHandler] = currentBlock.join('\n');
            }
            currentHandler = hm[1];
            currentBlock = [line];
        } else if (currentHandler) {
            currentBlock.push(line);
        }
    }
    if (currentHandler) handlerBlocks[currentHandler] = currentBlock.join('\n');

    var dynamicOps = {};
    var staticOpsArr = [];
    for (var hn in handlerBlocks) {
        var sn = HANDLER_MAP[hn];
        if (sn) {
            var opCodeVal = opcodeVals[OPCODE_NAMES.indexOf(sn)];
            var funcSrc = removeMarkers(handlerBlocks[hn], hn);
            if (sn !== 'EVAL' && sn !== 'JMP' && Math.random() < 0.4) {
                dynamicOps[sn] = { opcodeVal: opCodeVal, src: 'ops[' + opCodeVal + '] = ' + funcSrc + ';' };
            } else {
                staticOpsArr.push('ops[' + opCodeVal + '] = ' + funcSrc);
            }
        }
    }

    // Shuffle static operations so the layout is unpredictable
    for (var i = staticOpsArr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = staticOpsArr[i];
        staticOpsArr[i] = staticOpsArr[j];
        staticOpsArr[j] = temp;
    }

    var staticOpsStr = '\n' + staticOpsArr.join('\n') + '\n';
    code += staticOpsStr;
    code = removeMarkers(code);

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    var outputPath = path.join(OUTPUT_DIR, outputName + '.js');
    fs.writeFileSync(outputPath, code);

    var opcodes = {};
    for (var i = 0; i < OPCODE_NAMES.length; i++) {
        opcodes[OPCODE_NAMES[i]] = opcodeVals[i];
    }

    var argLayouts = {};
    for (var hn in rawLayouts) {
        var sn = HANDLER_MAP[hn];
        if (sn) argLayouts[sn] = rawLayouts[hn];
    }

    var config = {
        name: outputName,
        initialKey: key,
        lcgMul: lcgMul,
        lcgInc: lcgInc,
        opcodes: opcodes,
        argLayouts: argLayouts,
        dynamicOps: dynamicOps
    };

    var configPath = path.join(OUTPUT_DIR, outputName + '.config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    return {
        vmPath: outputPath,
        configPath: configPath,
        config: config
    };
}

function generateRandomId() {
    return 'vm_' + Math.random().toString(36).substring(2, 10);
}

if (require.main === module) {
    var name = process.argv[2] || generateRandomId();
    generateVMScript(name);
}

module.exports = { generateVMScript };
