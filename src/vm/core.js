// @INJECT_ERR_START
var _err = [
    [0x4f, 0x75, 0x74, 0x20, 0x6f, 0x66, 0x20, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79],
    [0x53, 0x74, 0x61, 0x63, 0x6b, 0x20, 0x6f, 0x76, 0x65, 0x72, 0x66, 0x6c, 0x6f, 0x77],
    [0x49, 0x6e, 0x76, 0x61, 0x6c, 0x69, 0x64, 0x20, 0x6f, 0x70, 0x63, 0x6f, 0x64, 0x65],
    [0x53, 0x65, 0x67, 0x66, 0x61, 0x75, 0x6c, 0x74]
];
// @INJECT_ERR_END

function _s(b) { var r = ''; for (var i = 0; i < b.length; i++) r += String.fromCharCode(b[i]); return r; }

function crash(ctx) {
    if (ctx) {
        ctx.mem = null;
        if (ctx.reg) ctx.reg.fill(0);
        if (ctx.stack) ctx.stack.length = 0;
        if (ctx.heap) ctx.heap.fill(0);
    }
    throw new Error(_s(_err[(Math.random() * _err.length) | 0]));
}

function check(addr, max) {
    return addr >= 0 && addr < max;
}

var _h1 = 0, _h2 = 0;

function _hash(m) {
    if (!m) return 0;
    var c = 0;
    for (var i = 0; i < m.length; i++) c = ((c << 5) - c + m[i]) | 0;
    return c;
}

function _fnh(fn) {
    var s = fn.toString(), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

function _ss(m, arr) {
    _h1 = _hash(m);
}

function _ver(ctx, arr) {
    if (_hash(ctx.mem) !== _h1) crash(ctx);
}

// @INJECT_CTX_START
var INIT_KEY = 0;

var ctx = {
    reg: new Array(256).fill(0),
    mem: null,
    ip: 0,
    xk: INIT_KEY,
    heap: new Array(65536).fill(0),
    stack: [],
    frames: [],
    env: (typeof window !== 'undefined') ? window : global
};
// @INJECT_CTX_END

// @INJECT_CONSTS_START
var MAX_STACK = 100000;
var MAX_FRAMES = 10000;
var LCG_MUL = 1664525;
var LCG_INC = 1013904223;
// @INJECT_CONSTS_END

function readByte() {
    if (ctx.ip >= ctx.mem.length) crash(ctx);
    var raw = ctx.mem[ctx.ip++];
    var dec = (raw ^ ctx.xk) & 0xFF;
    ctx.xk = (ctx.xk * LCG_MUL + LCG_INC) & 0xFF;
    return dec;
}

function readInt32() {
    var m = ctx.mem, p = ctx.ip, k = ctx.xk;
    if (p + 4 > m.length) crash(ctx);
    var b1 = (m[p] ^ k) & 0xFF; k = (k * LCG_MUL + LCG_INC) & 0xFF;
    var b2 = (m[p + 1] ^ k) & 0xFF; k = (k * LCG_MUL + LCG_INC) & 0xFF;
    var b3 = (m[p + 2] ^ k) & 0xFF; k = (k * LCG_MUL + LCG_INC) & 0xFF;
    var b4 = (m[p + 3] ^ k) & 0xFF; k = (k * LCG_MUL + LCG_INC) & 0xFF;
    ctx.ip = p + 4;
    ctx.xk = k;
    return (b1 | (b2 << 8) | (b3 << 16) | (b4 << 24));
}

function readStr() {
    var len = readInt32();
    var c = [];
    for (var i = 0; i < len; i++) c.push(String.fromCharCode(readByte()));
    return c.join('');
}

var ops = new Array(256);
for (var i = 0; i < 256; i++) {
    ops[i] = function () { crash(ctx); };
}
var _browser = typeof window !== 'undefined' || typeof process !== 'undefined';

function _init(b64) {
    var raw = atob(b64);
    ctx.mem = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) ctx.mem[i] = raw.charCodeAt(i);
    ctx.ip = 0;
    // @INJECT_INIT_XK
    ctx.reg.fill(0);
    ctx.heap.fill(0);
    ctx.stack = [];
    ctx.frames = [];
    _ss(ctx.mem, ops);
}

function _chunk(ms, max) {
    var start = Date.now();
    var c = 0;
    var l = ctx.mem.length;
    while (ctx.ip < l) {
        var op = readByte();
        var h = ops[op];
        if (!h) crash(ctx);
        h();
        if (++c >= max) {
            c = 0;
            if (Date.now() - start > ms) return 0;
        }
    }
    return 1;
}

function runVM(b64) {
    _init(b64);
    if (_browser) {
        var TIME = 15;
        var MAX = 2000;
        var _n = 0;
        function step() {
            try {
                if (_chunk(TIME, MAX)) {
                    _ver(ctx, ops);
                    return;
                }
                if (++_n % 10 === 0) _ver(ctx, ops);
                setTimeout(step, 0);
            } catch (e) {
                if (typeof window !== 'undefined' && window.__krak_throw) window.__krak_throw(e);
                else throw e;
            }
        }
        step();
    } else {
        throw new Error('KrakVM only supports browser execution.');
    }
}

module.exports = { runVM };