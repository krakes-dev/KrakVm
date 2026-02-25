function mov() {
    //@FETCH_START
    var r = readByte();
    var v = readInt32();
    //@FETCH_END
    ctx.reg[r] = v;
}

function movr() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.reg[s];
}

function add() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.reg[d] + ctx.reg[s];
}

function sub() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.reg[d] - ctx.reg[s];
}

function mul() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.reg[d] * ctx.reg[s];
}

function div() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    var a = ctx.reg[d], b = ctx.reg[s];
    ctx.reg[d] = a / b;
}

function mod() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.reg[d] % ctx.reg[s];
}

function nor() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ~(ctx.reg[d] | ctx.reg[s]);
}

function xor() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.reg[d] ^ ctx.reg[s];
}

function and() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.reg[d] & ctx.reg[s];
}

function or() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.reg[d] | ctx.reg[s];
}

function not() {
    //@FETCH_START
    var r = readByte();
    //@FETCH_END
    ctx.reg[r] = ~ctx.reg[r];
}

function shl() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.reg[d] << ctx.reg[s];
}

function shr() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.reg[d] >>> ctx.reg[s];
}

function shiftRightArith() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.reg[d] >> ctx.reg[s];
}

function load() {
    //@FETCH_START
    var d = readByte();
    var a = readByte();
    //@FETCH_END
    if (!check(ctx.reg[a], 65536)) crash(ctx);
    ctx.reg[d] = ctx.heap[ctx.reg[a] & 0xFFFF];
}

function store() {
    //@FETCH_START
    var a = readByte();
    var s = readByte();
    //@FETCH_END
    if (!check(ctx.reg[a], 65536)) crash(ctx);
    ctx.heap[ctx.reg[a] & 0xFFFF] = ctx.reg[s];
}

function cmp() {
    //@FETCH_START
    var a = readByte();
    var b = readByte();
    //@FETCH_END
    var v1 = ctx.reg[a];
    var v2 = ctx.reg[b];
    if (v1 === v2) ctx.reg[255] = 0;
    else if (v1 < v2) ctx.reg[255] = -1;
    else ctx.reg[255] = 1;
}

function inc() {
    //@FETCH_START
    var r = readByte();
    //@FETCH_END
    ctx.reg[r]++;
}

function dec() {
    //@FETCH_START
    var r = readByte();
    //@FETCH_END
    ctx.reg[r]--;
}

function jmp() {
    //@FETCH_START
    var k = readByte();
    var t = readInt32();
    //@FETCH_END
    if (t < 0 || t >= ctx.mem.length) crash(ctx);
    ctx.xk = k;
    ctx.ip = t;
}

function jz() {
    //@FETCH_START
    var r = readByte();
    var k = readByte();
    var t = readInt32();
    //@FETCH_END
    if (t < 0 || t >= ctx.mem.length) crash(ctx);
    if (!ctx.reg[r]) {
        ctx.ip = t;
        ctx.xk = k;
    }
}

function jnz() {
    //@FETCH_START
    var r = readByte();
    var k = readByte();
    var t = readInt32();
    //@FETCH_END
    if (t < 0 || t >= ctx.mem.length) crash(ctx);
    if (ctx.reg[r]) {
        ctx.ip = t;
        ctx.xk = k;
    }
}

function jlt() {
    //@FETCH_START
    var k = readByte();
    var t = readInt32();
    //@FETCH_END
    if (t < 0 || t >= ctx.mem.length) crash(ctx);
    if (ctx.reg[255] < 0) {
        ctx.ip = t;
        ctx.xk = k;
    }
}

function jgt() {
    //@FETCH_START
    var k = readByte();
    var t = readInt32();
    //@FETCH_END
    if (t < 0 || t >= ctx.mem.length) crash(ctx);
    if (ctx.reg[255] > 0) {
        ctx.ip = t;
        ctx.xk = k;
    }
}

function push() {
    //@FETCH_START
    var r = readByte();
    //@FETCH_END
    if (ctx.stack.length >= MAX_STACK) crash(ctx);
    ctx.stack.push(ctx.reg[r]);
}

function pop() {
    //@FETCH_START
    var r = readByte();
    //@FETCH_END
    var v = ctx.stack.pop();
    ctx.reg[r] = (v !== undefined) ? v : 0;
}

function calli() {
    //@FETCH_START
    var o = readByte();
    var c = readByte();
    //@FETCH_END
    var fn = ctx.reg[o];
    var args = new Array(c);
    for (var i = c - 1; i >= 0; i--) args[i] = ctx.stack.pop();

    var addr = (fn >> 8) & 0xFFFFFF;
    var key = fn & 0xFF;
    for (var i = 0; i < args.length; i++) ctx.stack.push(args[i]);
    ctx.stack.push(null);
    if (ctx.frames.length >= MAX_FRAMES) crash(ctx);
    ctx.frames.push(ctx.ip, ctx.xk);
    ctx.ip = addr;
    ctx.xk = key;
}

function calle() {
    //@FETCH_START
    var o = readByte();
    var c = readByte();
    //@FETCH_END
    var fn = ctx.reg[o];
    var args = new Array(c);
    for (var i = c - 1; i >= 0; i--) args[i] = ctx.stack.pop();
    ctx.reg[0] = fn.apply(null, args);
}

function ret() {
    var len = ctx.frames.length;
    if (len >= 2) {
        ctx.xk = ctx.frames[len - 1];
        ctx.ip = ctx.frames[len - 2];
        ctx.frames.length = len - 2;
    } else {
        ctx.ip = ctx.mem.length + 1;
    }
}

function out() {
    //@FETCH_START
    var r = readByte();
    //@FETCH_END
    console.log(ctx.reg[r]);
}

function halt() {
    ctx.ip = ctx.mem.length + 1;
}

function str() {
    //@FETCH_START
    var d = readByte();
    //@FETCH_END
    ctx.reg[d] = readStr();
}

function getGlobal() {
    //@FETCH_START
    var d = readByte();
    var n = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.env[ctx.reg[n]];
}

function getProp() {
    //@FETCH_START
    var d = readByte();
    var o = readByte();
    var p = readByte();
    //@FETCH_END
    var obj = ctx.reg[o];
    var key = ctx.reg[p];
    ctx.reg[d] = (obj == null) ? undefined : obj[key];
}

function setProp() {
    //@FETCH_START
    var o = readByte();
    var p = readByte();
    var v = readByte();
    //@FETCH_END
    var obj = ctx.reg[o];
    if (obj != null) obj[ctx.reg[p]] = ctx.reg[v];
}

function callMethod() {
    //@FETCH_START
    var d = readByte();
    var o = readByte();
    var m = readByte();
    var c = readByte();
    //@FETCH_END
    var obj = ctx.reg[o];
    var name = ctx.reg[m];
    var args = new Array(c);
    for (var i = c - 1; i >= 0; i--) args[i] = ctx.stack.pop();
    ctx.reg[d] = obj[name].apply(obj, args);
}

function toNum() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = Number(ctx.reg[s]);
}

function fromNum() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = ctx.reg[s];
}

function callAddr() {
    //@FETCH_START
    var k = readByte();
    var t = readInt32();
    //@FETCH_END
    if (ctx.frames.length >= MAX_FRAMES) crash(ctx);
    if (t < 0 || t >= ctx.mem.length) crash(ctx);
    ctx.frames.push(ctx.ip, ctx.xk);
    ctx.ip = t;
    ctx.xk = k;
}

function newObject() {
    //@FETCH_START
    var d = readByte();
    var c = readByte();
    var n = readByte();
    //@FETCH_END
    var C = ctx.reg[c];
    var args = new Array(n);
    for (var i = n - 1; i >= 0; i--) args[i] = ctx.stack.pop();
    ctx.reg[d] = new (Function.prototype.bind.apply(C, [null].concat(args)));
}

function instanceOf() {
    //@FETCH_START
    var d = readByte();
    var o = readByte();
    var c = readByte();
    //@FETCH_END
    ctx.reg[d] = (ctx.reg[o] instanceof ctx.reg[c]) ? 1 : 0;
}

function callRegInternal() {
    //@FETCH_START
    var f = readByte();
    var n = readByte();
    //@FETCH_END
    var fn = ctx.reg[f];
    var args = new Array(n);
    for (var i = n - 1; i >= 0; i--) args[i] = ctx.stack.pop();

    var addr = (fn >> 8) & 0xFFFFFF;
    var key = fn & 0xFF;
    for (var i = 0; i < args.length; i++) ctx.stack.push(args[i]);
    ctx.stack.push(undefined);
    if (ctx.frames.length >= MAX_FRAMES) crash(ctx);
    ctx.frames.push(ctx.ip, ctx.xk);
    ctx.ip = addr;
    ctx.xk = key;
}

function callRegExternal() {
    //@FETCH_START
    var d = readByte();
    var f = readByte();
    var n = readByte();
    //@FETCH_END
    var fn = ctx.reg[f];
    var args = new Array(n);
    for (var i = n - 1; i >= 0; i--) args[i] = ctx.stack.pop();
    ctx.reg[d] = fn.apply(undefined, args);
}

function typeOf() {
    //@FETCH_START
    var d = readByte();
    var s = readByte();
    //@FETCH_END
    ctx.reg[d] = typeof ctx.reg[s];
}

function toBool() {
    //@FETCH_START
    var d = readByte();
    var v = readByte();
    //@FETCH_END
    ctx.reg[d] = v !== 0;
}

function newFunc() {
    //@FETCH_START
    var d = readByte();
    var a = readInt32();
    var k = readByte();
    var n = readByte();
    //@FETCH_END
    ctx.reg[d] = ((a & 0xFFFFFF) << 8) | (k & 0xFF);
}

function _eval() {
    //@FETCH_START
    var s = readStr();
    //@FETCH_END
    eval(s);
}
