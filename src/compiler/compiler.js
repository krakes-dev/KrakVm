
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

function JsCompiler(config) {
    this.config = config;
    this.opcodes = config.opcodes;
    this.layouts = config.argLayouts;
    this.bytecode = [];
    this.labels = {};
    this.variables = {};
    this.nextVarSlot = 4;
    this.pendingJumps = [];
    this.functions = {};
    this.loopStack = [];
    this.hardeningEnabled = !!(config.compilerHardening && config.compilerHardening.enabled);
    this.hardeningSalt = ((config.compilerHardening && config.compilerHardening.seed) !== undefined
        ? (config.compilerHardening.seed | 0)
        : ((config.initialKey || 1) | 0));
    this.tempRegMap = {};
    this.tempRegUsed = {};
}

JsCompiler.prototype.allocVar = function (name) {
    if (this.variables[name] === undefined) {
        this.variables[name] = this.nextVarSlot++;
    }
    return this.variables[name];
};

JsCompiler.prototype.getVarReg = function (name) {
    var slot = this.variables[name];
    if (slot === undefined) throw new Error('Undefined variable: ' + name);
    return slot % 256;
};

JsCompiler.prototype.getTempReg = function (index) {
    if (!this.hardeningEnabled) return 200 + index;
    if (this.tempRegMap[index] !== undefined) return this.tempRegMap[index];
    var poolStart = 200;
    var poolSize = 54;
    var start = ((index * 7) + this.hardeningSalt) % poolSize;
    if (start < 0) start += poolSize;
    for (var probe = 0; probe < poolSize; probe++) {
        var reg = poolStart + ((start + probe) % poolSize);
        if (!this.tempRegUsed[reg]) {
            this.tempRegUsed[reg] = true;
            this.tempRegMap[index] = reg;
            return reg;
        }
    }
    var fallback = poolStart + (index % poolSize);
    this.tempRegMap[index] = fallback;
    return fallback;
};

JsCompiler.prototype.emit = function (bytes) {
    for (var i = 0; i < bytes.length; i++) this.bytecode.push(bytes[i] & 0xFF);
};

JsCompiler.prototype.currentAddress = function () {
    return this.bytecode.length;
};

JsCompiler.prototype.encodeArgs = function (layoutName, argValues) {
    if (layoutName === 'FUNC') {
        if (argValues.k === undefined) argValues.k = 0;
        if (argValues.n === undefined) argValues.n = 0;
    }
    var layout = this.layouts[layoutName] || [];
    var result = [];
    for (var i = 0; i < layout.length; i++) {
        var argDef = layout[i];
        var value = argValues[argDef.name];
        if (value === undefined) throw new Error('Missing arg: ' + argDef.name + ' for ' + layoutName);
        if (argDef.type === 'BYTE') {
            result.push(value & 0xFF);
        } else if (argDef.type === 'INT') {
            result.push(value & 0xFF);
            result.push((value >> 8) & 0xFF);
            result.push((value >> 16) & 0xFF);
            result.push((value >> 24) & 0xFF);
        }
    }
    return result;
};

JsCompiler.prototype.emitMovInt = function (reg, value) {
    if (reg === 1 && value === 0) return;
    this.emit([this.opcodes.MOV]);
    this.emit(this.encodeArgs('MOV', { r: reg, v: value }));
};

JsCompiler.prototype.emitMovBool = function (reg, val) {
    this.emit([this.opcodes.BOOL]);
    this.emit(this.encodeArgs('BOOL', { d: reg, v: val ? 1 : 0 }));
};

JsCompiler.prototype.emitMovReg = function (dest, src) {
    if (dest === src) return;
    this.emit([this.opcodes.MOVR]);
    this.emit(this.encodeArgs('MOVR', { d: dest, s: src }));
};

JsCompiler.prototype.emitBinaryOp = function (opName, dest, src) {
    this.emit([this.opcodes[opName]]);
    this.emit(this.encodeArgs(opName, { d: dest, s: src }));
};

JsCompiler.prototype.emitPush = function (reg) {
    this.emit([this.opcodes.PUSH]);
    this.emit(this.encodeArgs('PUSH', { r: reg }));
};

JsCompiler.prototype.emitPop = function (reg) {
    this.emit([this.opcodes.POP]);
    this.emit(this.encodeArgs('POP', { r: reg }));
};

JsCompiler.prototype.emitNewStr = function (destReg, str) {
    this.emit([this.opcodes.STR]);
    this.emit(this.encodeArgs('STR', { d: destReg }));
    var len = str.length;
    this.emit([len & 0xFF, (len >> 8) & 0xFF, (len >> 16) & 0xFF, (len >> 24) & 0xFF]);
    for (var i = 0; i < str.length; i++) this.emit([str.charCodeAt(i) & 0xFF]);
};

JsCompiler.prototype.emitEvalOp = function (src) {
    if (this.opcodes.EVAL === undefined) throw new Error('EVAL opcode not found in config');
    this.emit([this.opcodes.EVAL]);
    var len = src.length;
    this.emit([len & 0xFF, (len >> 8) & 0xFF, (len >> 16) & 0xFF, (len >> 24) & 0xFF]);
    for (var i = 0; i < len; i++) this.emit([src.charCodeAt(i) & 0xFF]);
};

JsCompiler.prototype.emitGetGlobal = function (destReg, nameReg) {
    this.emit([this.opcodes.GGLO]);
    this.emit(this.encodeArgs('GGLO', { d: destReg, n: nameReg }));
};

JsCompiler.prototype.emitGetProp = function (destReg, objReg, propReg) {
    this.emit([this.opcodes.GPRP]);
    this.emit(this.encodeArgs('GPRP', { d: destReg, o: objReg, p: propReg }));
};

JsCompiler.prototype.emitSetProp = function (objReg, propReg, valueReg) {
    this.emit([this.opcodes.SPRP]);
    this.emit(this.encodeArgs('SPRP', { o: objReg, p: propReg, v: valueReg }));
};

JsCompiler.prototype.emitCallMethod = function (destReg, objReg, methodReg, argCount) {
    this.emit([this.opcodes.METH]);
    this.emit(this.encodeArgs('METH', { d: destReg, o: objReg, m: methodReg, c: argCount }));
};

JsCompiler.prototype.emitFromNum = function (destReg, srcReg) {
    this.emit([this.opcodes.FNUM]);
    this.emit(this.encodeArgs('FNUM', { d: destReg, s: srcReg }));
};

JsCompiler.prototype.emitToNum = function (destReg, srcReg) {
    this.emit([this.opcodes.TNUM]);
    this.emit(this.encodeArgs('TNUM', { d: destReg, s: srcReg }));
};

JsCompiler.prototype.emitCallAddr = function (targetLabel) {
    this.emit([this.opcodes.CADR]);
    this.pendingJumps.push({ type: 'CADR', address: this.currentAddress(), label: targetLabel });
    this.emit(this.encodeArgs('CADR', { k: 0, t: 0 }));
};

JsCompiler.prototype.emitNew = function (destReg, constructorReg, argCount) {
    this.emit([this.opcodes.NEW]);
    this.emit(this.encodeArgs('NEW', { d: destReg, c: constructorReg, n: argCount }));
};

JsCompiler.prototype.emitInstanceOf = function (destReg, objReg, constrReg) {
    this.emit([this.opcodes.IOF]);
    this.emit(this.encodeArgs('IOF', { d: destReg, o: objReg, c: constrReg }));
};

JsCompiler.prototype.emitTypeof = function (destReg, srcReg) {
    this.emit([this.opcodes.TYP]);
    this.emit(this.encodeArgs('TYP', { d: destReg, s: srcReg }));
};

JsCompiler.prototype.emitCallReg = function (destReg, funcReg, argCount) {
    var typeReg = this.getTempReg(56);
    this.emitTypeof(typeReg, funcReg);
    var numTypeReg = this.getTempReg(57);
    this.emitNewStr(numTypeReg, 'number');
    this.emit([this.opcodes.CMP]);
    this.emit(this.encodeArgs('CMP', { a: typeReg, b: numTypeReg }));

    var externalLabel = '__creg_ext_' + this.currentAddress();
    var endLabel = '__creg_end_' + this.currentAddress();

    this.emit([this.opcodes.JNZ]);
    this.pendingJumps.push({ type: 'JNZ', address: this.currentAddress(), label: externalLabel, reg: 255 });
    this.emit(this.encodeArgs('JNZ', { r: 255, k: 0, t: 0 }));

    this.emit([this.opcodes.CREGI]);
    this.emit(this.encodeArgs('CREGI', { f: funcReg, n: argCount }));
    if (destReg !== 0) {
        this.emitMovReg(destReg, 0);
    }
    this.emitJmp(endLabel);

    this.setLabel(externalLabel);
    this.emit([this.opcodes.CREGE]);
    this.emit(this.encodeArgs('CREGE', { d: destReg, f: funcReg, n: argCount }));

    this.setLabel(endLabel);
};

JsCompiler.prototype.emitRet = function () {
    this.emit([this.opcodes.RET]);
};

JsCompiler.prototype.emitJz = function (reg, targetLabel) {
    this.emit([this.opcodes.JZ]);
    this.pendingJumps.push({ type: 'JZ', address: this.currentAddress(), label: targetLabel, reg: reg });
    this.emit(this.encodeArgs('JZ', { r: reg, k: 0, t: 0 }));
};

JsCompiler.prototype.emitJnz = function (reg, targetLabel) {
    this.emit([this.opcodes.JNZ]);
    this.pendingJumps.push({ type: 'JNZ', address: this.currentAddress(), label: targetLabel, reg: reg });
    this.emit(this.encodeArgs('JNZ', { r: reg, k: 0, t: 0 }));
};

JsCompiler.prototype.emitJmp = function (targetLabel) {
    this.emit([this.opcodes.JMP]);
    this.pendingJumps.push({ type: 'JMP', address: this.currentAddress(), label: targetLabel });
    this.emit(this.encodeArgs('JMP', { k: 0, t: 0 }));
};

JsCompiler.prototype.emitJgt = function (targetLabel) {
    this.emit([this.opcodes.JGT]);
    this.pendingJumps.push({ type: 'JGT', address: this.currentAddress(), label: targetLabel });
    this.emit(this.encodeArgs('JGT', { k: 0, t: 0 }));
};

JsCompiler.prototype.emitJlt = function (targetLabel) {
    this.emit([this.opcodes.JLT]);
    this.pendingJumps.push({ type: 'JLT', address: this.currentAddress(), label: targetLabel });
    this.emit(this.encodeArgs('JLT', { k: 0, t: 0 }));
};

JsCompiler.prototype.setLabel = function (name) {
    this.labels[name] = this.currentAddress();
};

JsCompiler.prototype.emitHardeningFlowNoise = function (tag) {
    if (!this.hardeningEnabled) return;
    if (((this.currentAddress() + this.hardeningSalt) & 3) !== 0) return;
    var splitLabel = '__h_split_' + tag + '_' + this.currentAddress();
    this.emitJmp(splitLabel);
    this.setLabel(splitLabel);
    var opaqueJoin = '__h_opaque_' + tag + '_' + this.currentAddress();
    var opaqueReg = this.getTempReg(53);
    this.emitMovInt(opaqueReg, 1);
    this.emitJz(opaqueReg, opaqueJoin);
    this.setLabel(opaqueJoin);
};

JsCompiler.prototype.nodeContainsReturn = function (node) {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'ReturnStatement') return true;
    for (var key in node) {
        if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
        var value = node[key];
        if (Array.isArray(value)) {
            for (var i = 0; i < value.length; i++) {
                if (this.nodeContainsReturn(value[i])) return true;
            }
        } else if (value && typeof value === 'object') {
            if (this.nodeContainsReturn(value)) return true;
        }
    }
    return false;
};

JsCompiler.prototype.compileExpression = function (node, targetReg) {
    switch (node.type) {
        case 'Literal':
            if (node.value === null) {
                this.emitMovInt(targetReg, 0);
            } else if (typeof node.value === 'number') {
                if (Number.isInteger(node.value) && node.value >= -2147483648 && node.value <= 2147483647) {
                    this.emitMovInt(targetReg, node.value | 0);
                } else {
                    this.emitNewStr(targetReg, String(node.value));
                    this.emitToNum(targetReg, targetReg);
                }
            } else if (typeof node.value === 'string') {
                this.emitNewStr(targetReg, node.value);
            } else if (typeof node.value === 'boolean') {
                this.emitMovBool(targetReg, node.value);
            } else if (typeof node.value === 'bigint') {
                var strReg = this.getTempReg(0);
                var bigIntConstReg = this.getTempReg(1);
                this.emitNewStr(strReg, node.value.toString());
                this.emitNewStr(bigIntConstReg, 'BigInt');
                this.emitGetGlobal(bigIntConstReg, bigIntConstReg);
                this.emitPush(strReg);
                this.emitCallReg(targetReg, bigIntConstReg, 1);
            } else {
                throw new Error('Unsupported literal type: ' + typeof node.value);
            }
            break;

        case 'Identifier':
            if (this.variables[node.name] !== undefined) {
                var srcReg = this.getVarReg(node.name);
                if (srcReg !== targetReg) this.emitMovReg(targetReg, srcReg);
            } else {
                this.emitNewStr(this.getTempReg(2), node.name);
                this.emitGetGlobal(targetReg, this.getTempReg(2));
            }
            break;

        case 'LogicalExpression':
            if (node.operator === '||') {
                this.compileExpression(node.left, targetReg);
                var endLabel = '__or_end_' + this.currentAddress();
                this.emitJnz(targetReg, endLabel);
                this.compileExpression(node.right, targetReg);
                this.setLabel(endLabel);
            } else if (node.operator === '&&') {
                this.compileExpression(node.left, targetReg);
                var endLabel = '__and_end_' + this.currentAddress();
                this.emitJz(targetReg, endLabel);
                this.compileExpression(node.right, targetReg);
                this.setLabel(endLabel);
            } else if (node.operator === '??') {
                this.compileExpression(node.left, targetReg);
                var endLabel = '__nc_end_' + this.currentAddress();
                this.emitJnz(targetReg, endLabel);
                this.compileExpression(node.right, targetReg);
                this.setLabel(endLabel);
            } else {
                throw new Error('Unsupported logical operator: ' + node.operator);
            }
            break;

        case 'BinaryExpression':
            this.compileExpression(node.left, targetReg);
            var tempReg;
            if (node.right.type === 'Identifier' && this.variables[node.right.name] !== undefined) {
                tempReg = this.getVarReg(node.right.name);
            } else if (node.right.type === 'Literal' && node.right.value === 0) {
                tempReg = 1;
            } else {
                tempReg = (targetReg === this.getTempReg(0)) ? this.getTempReg(1) : this.getTempReg(0);
                if (node.right.type === 'Literal') {
                    this.compileExpression(node.right, tempReg);
                } else {
                    this.emitPush(targetReg);
                    this.compileExpression(node.right, tempReg);
                    this.emitPop(targetReg);
                }
            }

            var opMap = {
                '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV',
                '%': 'MOD', '&': 'AND', '|': 'OR', '^': 'XOR',
                '<<': 'SHL', '>>': 'SAR', '>>>': 'SHR'
            };
            var opName = opMap[node.operator];
            if (opName) {
                this.emitBinaryOp(opName, targetReg, tempReg);
            } else {
                this.emit([this.opcodes.CMP]);
                this.emit(this.encodeArgs('CMP', { a: targetReg, b: tempReg }));
                switch (node.operator) {
                    case '==': case '===':
                        this.emitMovBool(targetReg, 0);
                        this.emit([this.opcodes.JNZ]);
                        var l1 = '__cmp_skip_' + this.currentAddress();
                        this.pendingJumps.push({ type: 'JNZ', address: this.currentAddress(), label: l1, reg: 255 });
                        this.emit(this.encodeArgs('JNZ', { r: 255, k: 0, t: 0 }));
                        this.emitMovBool(targetReg, 1);
                        this.setLabel(l1);
                        break;
                    case '!=': case '!==':
                        this.emitMovBool(targetReg, 0);
                        this.emit([this.opcodes.JZ]);
                        var l2 = '__cmp_skip_' + this.currentAddress();
                        this.pendingJumps.push({ type: 'JZ', address: this.currentAddress(), label: l2, reg: 255 });
                        this.emit(this.encodeArgs('JZ', { r: 255, k: 0, t: 0 }));
                        this.emitMovBool(targetReg, 1);
                        this.setLabel(l2);
                        break;
                    case '<':
                        this.emitMovBool(targetReg, 0);
                        this.emit([this.opcodes.JGT]);
                        var l3 = '__cmp_skip_' + this.currentAddress();
                        this.pendingJumps.push({ type: 'JGT', address: this.currentAddress(), label: l3 });
                        this.emit(this.encodeArgs('JGT', { k: 0, t: 0 }));
                        this.emit([this.opcodes.JZ]);
                        var l4 = '__cmp_skip2_' + this.currentAddress();
                        this.pendingJumps.push({ type: 'JZ', address: this.currentAddress(), label: l4, reg: 255 });
                        this.emit(this.encodeArgs('JZ', { r: 255, k: 0, t: 0 }));
                        this.emitMovBool(targetReg, 1);
                        this.setLabel(l3); this.setLabel(l4);
                        break;
                    case '<=':
                        this.emitMovBool(targetReg, 0);
                        this.emit([this.opcodes.JGT]);
                        var l5 = '__cmp_skip_' + this.currentAddress();
                        this.pendingJumps.push({ type: 'JGT', address: this.currentAddress(), label: l5 });
                        this.emit(this.encodeArgs('JGT', { k: 0, t: 0 }));
                        this.emitMovBool(targetReg, 1);
                        this.setLabel(l5);
                        break;
                    case '>':
                        this.emitMovBool(targetReg, 0);
                        this.emit([this.opcodes.JLT]);
                        var l6 = '__cmp_skip_' + this.currentAddress();
                        this.pendingJumps.push({ type: 'JLT', address: this.currentAddress(), label: l6 });
                        this.emit(this.encodeArgs('JLT', { k: 0, t: 0 }));
                        this.emit([this.opcodes.JZ]);
                        var l7 = '__cmp_skip2_' + this.currentAddress();
                        this.pendingJumps.push({ type: 'JZ', address: this.currentAddress(), label: l7, reg: 255 });
                        this.emit(this.encodeArgs('JZ', { r: 255, k: 0, t: 0 }));
                        this.emitMovBool(targetReg, 1);
                        this.setLabel(l6); this.setLabel(l7);
                        break;
                    case '>=':
                        this.emitMovBool(targetReg, 0);
                        this.emit([this.opcodes.JLT]);
                        var l8 = '__cmp_skip_' + this.currentAddress();
                        this.pendingJumps.push({ type: 'JLT', address: this.currentAddress(), label: l8 });
                        this.emit(this.encodeArgs('JLT', { k: 0, t: 0 }));
                        this.emitMovBool(targetReg, 1);
                        this.setLabel(l8);
                        break;
                    case 'instanceof':
                        this.emitInstanceOf(targetReg, targetReg, tempReg);
                        break;
                    default:
                        throw new Error('Unsupported binary operator: ' + node.operator);
                }
            }
            break;

        case 'CallExpression':
            this.compileCallExpression(node, targetReg);
            break;

        case 'NewExpression':
            this.compileNewExpression(node, targetReg);
            break;

        case 'MemberExpression':
            this.compileMemberExpression(node, targetReg);
            break;

        case 'AssignmentExpression':
            if (node.operator === '=') {
                this.compileExpression(node.right, targetReg);
                if (node.left.type === 'Identifier') {
                    var destReg = this.allocVar(node.left.name);
                    if (destReg !== targetReg) this.emitMovReg(destReg, targetReg);
                } else if (node.left.type === 'MemberExpression') {
                    this.emitPush(targetReg);
                    var objReg = this.getTempReg(10);
                    var propReg = this.getTempReg(11);
                    this.compileMemberBase(node.left, objReg, propReg);
                    var valueReg = this.getTempReg(12);
                    this.emitPop(valueReg);
                    this.emitSetProp(objReg, propReg, valueReg);
                    if (targetReg !== valueReg) this.emitMovReg(targetReg, valueReg);
                }
            } else {
                var op = node.operator.slice(0, -1);
                var opMap = {
                    '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV',
                    '%': 'MOD', '&': 'AND', '|': 'OR', '^': 'XOR',
                    '<<': 'SHL', '>>': 'SAR', '>>>': 'SHR'
                };
                var opName = opMap[op];
                if (!opName) throw new Error('Unsupported compound assignment: ' + node.operator);

                if (node.left.type === 'Identifier') {
                    var destReg = this.allocVar(node.left.name) % 256;
                    var tempReg = this.getTempReg(0);
                    this.compileExpression(node.right, tempReg);
                    this.emitBinaryOp(opName, destReg, tempReg);
                    if (targetReg !== destReg) this.emitMovReg(targetReg, destReg);
                } else if (node.left.type === 'MemberExpression') {
                    var objReg = this.getTempReg(20);
                    var propReg = this.getTempReg(21);
                    this.compileMemberBase(node.left, objReg, propReg);
                    var currentValReg = this.getTempReg(19);
                    this.emitGetProp(currentValReg, objReg, propReg);
                    var rightValReg = this.getTempReg(0);
                    this.compileExpression(node.right, rightValReg);
                    this.emitBinaryOp(opName, currentValReg, rightValReg);
                    this.emitSetProp(objReg, propReg, currentValReg);
                    if (targetReg !== 0) this.emitMovReg(targetReg, currentValReg);
                }
            }
            break;

        case 'UnaryExpression':
            if (node.operator === 'typeof') {
                var srcReg = this.getTempReg(0);
                this.compileExpression(node.argument, srcReg);
                this.emitTypeof(targetReg, srcReg);
            } else if (node.operator === '!') {
                var testReg = (targetReg === this.getTempReg(0)) ? this.getTempReg(1) : this.getTempReg(0);
                this.compileExpression(node.argument, testReg);
                var trueLabel = '__not_true_' + this.currentAddress();
                var endLabel = '__not_end_' + this.currentAddress();
                this.emitJz(testReg, trueLabel);
                this.emitMovBool(targetReg, false);
                this.emitJmp(endLabel);
                this.setLabel(trueLabel);
                this.emitMovBool(targetReg, true);
                this.setLabel(endLabel);
            } else if (node.operator === '-') {
                var valReg = (targetReg === this.getTempReg(0)) ? this.getTempReg(1) : this.getTempReg(0);
                this.compileExpression(node.argument, valReg);
                this.emitMovInt(targetReg, 0);
                this.emitBinaryOp('SUB', targetReg, valReg);
            } else if (node.operator === '+') {
                this.compileExpression(node.argument, targetReg);
            } else if (node.operator === 'void') {
                this.compileExpression(node.argument, this.getTempReg(0));
                this.emitMovInt(targetReg, 0);
            } else if (node.operator === '~') {
                this.compileExpression(node.argument, targetReg);
                this.emit([this.opcodes.NOT]);
                this.emit(this.encodeArgs('NOT', { r: targetReg }));
            }
            break;

        case 'ArrayExpression':
            var arrayConstReg = this.getTempReg(6);
            this.emitNewStr(this.getTempReg(7), 'Array');
            this.emitGetGlobal(arrayConstReg, this.getTempReg(7));
            this.emitNew(targetReg, arrayConstReg, 0);
            for (var i = 0; i < node.elements.length; i++) {
                var elReg = (targetReg === this.getTempReg(5)) ? this.getTempReg(13) : this.getTempReg(5);
                this.compileExpression(node.elements[i], elReg);
                this.emitPush(elReg);
                var pushMethodReg = this.getTempReg(4);
                this.emitNewStr(pushMethodReg, 'push');
                this.emitCallMethod(this.getTempReg(9), targetReg, pushMethodReg, 1);
            }
            break;

        case 'ObjectExpression':
            var objReg = this.getTempReg(5);
            var objConstReg = this.getTempReg(6);
            this.emitNewStr(this.getTempReg(7), 'Object');
            this.emitGetGlobal(objConstReg, this.getTempReg(7));
            this.emitNew(objReg, objConstReg, 0);
            for (var i = 0; i < node.properties.length; i++) {
                var prop = node.properties[i];
                var propReg = this.getTempReg(28);
                var valReg = this.getTempReg(29);
                var keyName = prop.key.name || prop.key.value;
                this.emitNewStr(propReg, String(keyName));
                this.compileExpression(prop.value, valReg);
                this.emitSetProp(objReg, propReg, valReg);
            }
            if (targetReg !== objReg) this.emitMovReg(targetReg, objReg);
            break;

        case 'ArrowFunctionExpression':
        case 'FunctionExpression':
            var labelName = 'anon_' + this.currentAddress();
            var startLabel = '__func_' + labelName;
            var endLabel = '__func_end_' + labelName;
            this.emitJmp(endLabel);
            this.setLabel(startLabel);
            var savedVars = this.variables;
            var savedNextSlot = this.nextVarSlot;
            this.variables = Object.assign({}, this.variables);
            this.allocVar('this');
            for (var p = 0; p < node.params.length; p++) this.allocVar(node.params[p].name);
            var thisReg = this.getVarReg('this');
            this.emitPop(thisReg);
            for (var p = node.params.length - 1; p >= 0; p--) {
                var paramReg = this.getVarReg(node.params[p].name);
                this.emitPop(paramReg);
            }
            if (node.body.type === 'BlockStatement') {
                this.compileStatement(node.body);
            } else {
                this.compileExpression(node.body, 0);
                this.emitRet();
            }
            if (node.body.type === 'BlockStatement') {
                this.emitMovInt(0, 0);
                this.emitRet();
            }
            this.variables = savedVars;
            this.nextVarSlot = savedNextSlot;
            this.setLabel(endLabel);
            this.emit([this.opcodes.FUNC]);
            this.pendingJumps.push({ type: 'FUNC', address: this.currentAddress(), label: startLabel });
            this.emit(this.encodeArgs('FUNC', { d: targetReg, a: 0, k: 0, n: node.params.length }));
            break;

        case 'ThisExpression':
            if (this.variables['this'] !== undefined) {
                var reg = this.getVarReg('this');
                this.emitMovReg(targetReg, reg);
            } else {
                this.emitMovInt(targetReg, 0);
            }
            break;

        case 'ConditionalExpression':
            var elseLabel = '__cond_else_' + this.currentAddress();
            var endLabel = '__cond_end_' + this.currentAddress();
            var testReg = (targetReg === this.getTempReg(0)) ? this.getTempReg(1) : this.getTempReg(0);
            this.compileExpression(node.test, testReg);
            this.emitJz(testReg, elseLabel);
            this.compileExpression(node.consequent, targetReg);
            this.emitJmp(endLabel);
            this.setLabel(elseLabel);
            this.compileExpression(node.alternate, targetReg);
            this.setLabel(endLabel);
            break;

        case 'UpdateExpression':
            if (node.argument.type === 'Identifier') {
                var varReg = this.getVarReg(node.argument.name);
                var op = node.operator === '++' ? 'INC' : 'DEC';
                if (node.prefix) {
                    this.emit([this.opcodes[op]]);
                    this.emit(this.encodeArgs(op, { r: varReg }));
                    if (targetReg !== varReg) this.emitMovReg(targetReg, varReg);
                } else {
                    if (targetReg !== varReg) this.emitMovReg(targetReg, varReg);
                    this.emit([this.opcodes[op]]);
                    this.emit(this.encodeArgs(op, { r: varReg }));
                }
            } else if (node.argument.type === 'MemberExpression') {
                var objReg = this.getTempReg(20);
                var propReg = this.getTempReg(21);
                this.compileMemberBase(node.argument, objReg, propReg);
                var valReg = this.getTempReg(19);
                this.emitGetProp(valReg, objReg, propReg);
                if (!node.prefix) this.emitMovReg(targetReg, valReg);
                var oneReg = this.getTempReg(0);
                this.emitMovInt(oneReg, 1);
                if (node.operator === '++') this.emitBinaryOp('ADD', valReg, oneReg);
                else this.emitBinaryOp('SUB', valReg, oneReg);
                if (node.prefix) this.emitMovReg(targetReg, valReg);
                this.emitSetProp(objReg, propReg, valReg);
            }
            break;

        case 'SequenceExpression':
            for (var i = 0; i < node.expressions.length; i++) this.compileExpression(node.expressions[i], targetReg);
            break;

        case 'TemplateLiteral':
            if (node.quasis.length === 1 && node.expressions.length === 0) {
                this.emitNewStr(targetReg, node.quasis[0].value.cooked);
            } else {
                this.emitNewStr(targetReg, node.quasis[0].value.cooked);
                for (var i = 0; i < node.expressions.length; i++) {
                    this.emitPush(targetReg);
                    var exprReg = this.getTempReg(0);
                    this.compileExpression(node.expressions[i], exprReg);
                    this.emitPop(targetReg);
                    this.emitBinaryOp('ADD', targetReg, exprReg);
                    var nextQuasi = node.quasis[i + 1].value.cooked;
                    if (nextQuasi.length > 0) {
                        this.emitPush(targetReg);
                        this.emitNewStr(this.getTempReg(0), nextQuasi);
                        this.emitPop(targetReg);
                        this.emitBinaryOp('ADD', targetReg, this.getTempReg(0));
                    }
                }
            }
            break;

        default:
            throw new Error('Unsupported expression: ' + node.type);
    }
};

JsCompiler.prototype.compileMemberBase = function (node, objReg, propReg) {
    if (node.object.type === 'Identifier' && this.variables[node.object.name] === undefined) {
        this.emitNewStr(this.getTempReg(0), node.object.name);
        this.emitGetGlobal(objReg, this.getTempReg(0));
    } else {
        this.compileExpression(node.object, objReg);
    }
    if (node.computed) {
        this.compileExpression(node.property, propReg);
    } else {
        var propName = node.property.name || node.property.value;
        this.emitNewStr(propReg, String(propName));
    }
};

JsCompiler.prototype.tryCompileConditionExit = function (node, exitLabel) {
    if (node.type !== 'BinaryExpression') return false;
    var op = node.operator;
    if (['<', '<=', '>', '>=', '==', '===', '!=', '!=='].indexOf(op) === -1) return false;

    var leftReg;
    if (node.left.type === 'Identifier' && this.variables[node.left.name] !== undefined) {
        leftReg = this.getVarReg(node.left.name);
    } else {
        leftReg = this.getTempReg(54);
        this.compileExpression(node.left, leftReg);
    }
    var rightReg;
    if (node.right.type === 'Identifier' && this.variables[node.right.name] !== undefined) {
        rightReg = this.getVarReg(node.right.name);
    } else if (node.right.type === 'Literal' && node.right.value === 0) {
        rightReg = 1;
    } else {
        rightReg = this.getTempReg(55);
        this.compileExpression(node.right, rightReg);
    }

    this.emit([this.opcodes.CMP]);
    this.emit(this.encodeArgs('CMP', { a: leftReg, b: rightReg }));

    switch (op) {
        case '<': this.emitJgt(exitLabel); this.emitJz(255, exitLabel); break;
        case '<=': this.emitJgt(exitLabel); break;
        case '>': this.emitJlt(exitLabel); this.emitJz(255, exitLabel); break;
        case '>=': this.emitJlt(exitLabel); break;
        case '==': case '===': this.emitJlt(exitLabel); this.emitJgt(exitLabel); break;
        case '!=': case '!==': this.emitJz(255, exitLabel); break;
    }
    return true;
};

JsCompiler.prototype.compileMemberExpression = function (node, targetReg) {
    var objReg = this.getTempReg(20);
    var propReg = this.getTempReg(21);
    this.compileMemberBase(node, objReg, propReg);
    this.emitGetProp(targetReg, objReg, propReg);
};

JsCompiler.prototype.canInlineFunction = function (funcName) {
    return false;
};

JsCompiler.prototype.compileCallExpression = function (node, targetReg) {
    if (node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.property.name) {
        var methodName = node.callee.property.name;
        var isCbMethod = methodName === 'map' || methodName === 'filter' || methodName === 'forEach';
        if (isCbMethod) {
            if (node.arguments.length < 1) throw new Error('Array.' + methodName + ' requires a callback');

            var callbackArg = node.arguments[0];
            var cbType = callbackArg.type;
            var isInlineCallback = cbType === 'ArrowFunctionExpression' || cbType === 'FunctionExpression';
            var isIdentifierCallback = cbType === 'Identifier';

            var uid = this.currentAddress();
            var colReg = this.allocVar('__cb_col_' + uid) % 256;
            var lenReg = this.allocVar('__cb_len_' + uid) % 256;
            var idxReg = this.allocVar('__cb_idx_' + uid) % 256;
            var resReg = this.allocVar('__cb_res_' + uid) % 256;
            var elemReg = this.allocVar('__cb_el_' + uid) % 256;
            var cbResReg = this.allocVar('__cb_val_' + uid) % 256;
            var undefinedReg = this.allocVar('__cb_undef_' + uid) % 256;
            this.emitMovInt(undefinedReg, 0);

            this.compileExpression(node.callee.object, colReg);
            this.emitNewStr(this.getTempReg(4), 'length');
            this.emitGetProp(lenReg, colReg, this.getTempReg(4));
            this.emitToNum(lenReg, lenReg);

            if (methodName === 'map' || methodName === 'filter') {
                var arrayConstReg = this.getTempReg(6);
                this.emitNewStr(this.getTempReg(7), 'Array');
                this.emitGetGlobal(arrayConstReg, this.getTempReg(7));
                this.emitNew(resReg, arrayConstReg, 0);
            }

            this.emitMovInt(idxReg, 0);
            var loopStart = '__cb_loop_' + uid;
            var loopEnd = '__cb_end_' + uid;
            var loopBody = '__cb_body_' + uid;
            this.setLabel(loopStart);
            this.emitHardeningFlowNoise('cb');
            this.emit([this.opcodes.CMP]);
            this.emit(this.encodeArgs('CMP', { a: idxReg, b: lenReg }));
            this.emit([this.opcodes.JLT]);
            this.pendingJumps.push({ type: 'JLT', address: this.currentAddress(), label: loopBody });
            this.emit(this.encodeArgs('JLT', { k: 0, t: 0 }));
            this.emitJmp(loopEnd);
            this.setLabel(loopBody);

            this.emitFromNum(this.getTempReg(4), idxReg);
            this.emitGetProp(elemReg, colReg, this.getTempReg(4));

            if (isInlineCallback) {
                var callbackArity = callbackArg.params.length;
                var savedVars = this.variables;
                var savedNextSlot = this.nextVarSlot;
                this.variables = Object.assign({}, this.variables);
                if (callbackArity >= 1) {
                    var p0Reg = this.allocVar(callbackArg.params[0].name) % 256;
                    this.emitMovReg(p0Reg, elemReg);
                }
                if (callbackArity >= 2) {
                    var p1Reg = this.allocVar(callbackArg.params[1].name) % 256;
                    this.emitMovReg(p1Reg, idxReg);
                }
                if (callbackArity >= 3) {
                    var p2Reg = this.allocVar(callbackArg.params[2].name) % 256;
                    this.emitMovReg(p2Reg, colReg);
                }
                if (callbackArg.body.type === 'BlockStatement') {
                    this.compileStatement(callbackArg.body);
                    this.emitMovInt(cbResReg, 0);
                } else {
                    this.compileExpression(callbackArg.body, cbResReg);
                }
                this.variables = savedVars;
                this.nextVarSlot = savedNextSlot;
            } else {
                var callReg = (cbType === 'Identifier') ? this.getVarReg(callbackArg.name) : this.getTempReg(8);
                if (cbType !== 'Identifier') {
                    // This case shouldn't be hit with current checks but for completeness
                }
                this.emitPush(elemReg);
                this.emitPush(idxReg);
                this.emitPush(colReg);
                this.emitCallReg(cbResReg, callReg, 3);
            }

            if (methodName === 'map') {
                this.emitPush(cbResReg);
                this.emitNewStr(this.getTempReg(4), 'push');
                this.emitCallMethod(this.getTempReg(9), resReg, this.getTempReg(4), 1);
            } else if (methodName === 'filter') {
                var skipPush = '__cb_skip_' + uid + '_' + this.currentAddress();
                this.emitJz(cbResReg, skipPush);
                this.emitPush(elemReg);
                this.emitNewStr(this.getTempReg(4), 'push');
                this.emitCallMethod(this.getTempReg(9), resReg, this.getTempReg(4), 1);
                this.setLabel(skipPush);
            }

            this.emit([this.opcodes.INC]);
            this.emit(this.encodeArgs('INC', { r: idxReg }));
            this.emitJmp(loopStart);
            this.setLabel(loopEnd);

            if (methodName === 'map' || methodName === 'filter') {
                if (targetReg !== resReg) this.emitMovReg(targetReg, resReg);
            } else {
                this.emitMovInt(targetReg, 0);
            }
            return;
        }
    }

    if (node.callee.type === 'Identifier' && this.functions[node.callee.name]) {
        var funcName = node.callee.name;
        for (var i = 0; i < node.arguments.length; i++) {
            var argReg = this.getTempReg(40 + i);
            this.compileExpression(node.arguments[i], argReg);
            this.emitPush(argReg);
        }
        var thisPlaceholder = this.getTempReg(0);
        this.emitMovInt(thisPlaceholder, 0);
        this.emitPush(thisPlaceholder);
        this.emitCallAddr('__func_' + funcName);
        if (targetReg !== 0) this.emitMovReg(targetReg, 0);
        return;
    }

    if (node.callee.type === 'Identifier') {
        for (var i = 0; i < node.arguments.length; i++) {
            var argReg = this.getTempReg(40 + i);
            this.compileExpression(node.arguments[i], argReg);
            this.emitPush(argReg);
        }
        var funcReg;
        if (this.variables[node.callee.name] !== undefined) {
            funcReg = this.getVarReg(node.callee.name);
        } else {
            funcReg = this.getTempReg(8);
            this.emitNewStr(this.getTempReg(7), node.callee.name);
            this.emitGetGlobal(funcReg, this.getTempReg(7));
        }
        this.emitCallReg(targetReg, funcReg, node.arguments.length);
        return;
    }

    var argCount = node.arguments.length;
    for (var i = 0; i < argCount; i++) {
        var argReg = this.getTempReg(40 + i);
        this.compileExpression(node.arguments[i], argReg);
        this.emitPush(argReg);
    }
    if (node.callee.type === 'MemberExpression') {
        var objReg = this.getTempReg(30);
        var methodReg = this.getTempReg(31);
        this.compileMemberBase(node.callee, objReg, methodReg);
        this.emitCallMethod(targetReg, objReg, methodReg, argCount);
    } else {
        var funcReg = this.getTempReg(8);
        this.compileExpression(node.callee, funcReg);
        this.emitCallReg(targetReg, funcReg, argCount);
    }
};

JsCompiler.prototype.compileNewExpression = function (node, targetReg) {
    for (var i = 0; i < node.arguments.length; i++) {
        var argReg = this.getTempReg(1);
        this.compileExpression(node.arguments[i], argReg);
        this.emitPush(argReg);
    }
    var constructorReg = this.getTempReg(0);
    this.compileExpression(node.callee, constructorReg);
    this.emitNew(targetReg, constructorReg, node.arguments.length);
};

JsCompiler.prototype.compileStatement = function (node) {
    switch (node.type) {
        case 'VariableDeclaration':
            for (var i = 0; i < node.declarations.length; i++) {
                var decl = node.declarations[i];
                var reg = this.allocVar(decl.id.name) % 256;
                if (decl.init) this.compileExpression(decl.init, reg);
                else this.emitMovInt(reg, 0);
            }
            break;

        case 'ExpressionStatement':
            this.compileExpression(node.expression, this.getTempReg(3));
            break;

        case 'IfStatement':
            var endLabel = '__if_end_' + this.currentAddress();
            var elseLabel = '__if_else_' + this.currentAddress();
            if (node.alternate) {
                if (!this.tryCompileConditionExit(node.test, elseLabel)) {
                    this.compileExpression(node.test, 254);
                    this.emitJz(254, elseLabel);
                }
                this.compileStatement(node.consequent);
                this.emitJmp(endLabel);
                this.setLabel(elseLabel);
                this.compileStatement(node.alternate);
            } else {
                if (!this.tryCompileConditionExit(node.test, endLabel)) {
                    this.compileExpression(node.test, 254);
                    this.emitJz(254, endLabel);
                }
                this.compileStatement(node.consequent);
            }
            this.setLabel(endLabel);
            break;

        case 'WhileStatement':
            var loopStart = '__while_start_' + this.currentAddress();
            var loopEnd = '__while_end_' + this.currentAddress();
            this.setLabel(loopStart);
            this.emitHardeningFlowNoise('while');
            if (!this.tryCompileConditionExit(node.test, loopEnd)) {
                this.compileExpression(node.test, 254);
                this.emitJz(254, loopEnd);
            }
            this.loopStack.push({ continueLabel: loopStart, breakLabel: loopEnd });
            this.compileStatement(node.body);
            this.loopStack.pop();
            this.emitJmp(loopStart);
            this.setLabel(loopEnd);
            break;

        case 'DoWhileStatement':
            var doStart = '__do_start_' + this.currentAddress();
            var doEnd = '__do_end_' + this.currentAddress();
            var doCond = '__do_cond_' + this.currentAddress();
            this.setLabel(doStart);
            this.emitHardeningFlowNoise('dowhile');
            this.loopStack.push({ continueLabel: doCond, breakLabel: doEnd });
            this.compileStatement(node.body);
            this.loopStack.pop();
            this.setLabel(doCond);
            this.compileExpression(node.test, 254);
            this.emitJnz(254, doStart);
            this.setLabel(doEnd);
            break;

        case 'ForStatement':
            var forStart = '__for_start_' + this.currentAddress();
            var forEnd = '__for_end_' + this.currentAddress();
            var forUpdate = '__for_update_' + this.currentAddress();
            if (node.init) {
                if (node.init.type === 'VariableDeclaration') this.compileStatement(node.init);
                else this.compileExpression(node.init, this.getTempReg(3));
            }
            this.setLabel(forStart);
            this.emitHardeningFlowNoise('for');
            if (node.test) {
                if (!this.tryCompileConditionExit(node.test, forEnd)) {
                    this.compileExpression(node.test, 254);
                    this.emitJz(254, forEnd);
                }
            }
            this.loopStack.push({ continueLabel: forUpdate, breakLabel: forEnd });
            this.compileStatement(node.body);
            this.loopStack.pop();
            this.setLabel(forUpdate);
            if (node.update) this.compileExpression(node.update, this.getTempReg(3));
            this.emitJmp(forStart);
            this.setLabel(forEnd);
            break;

        case 'BlockStatement':
            for (var i = 0; i < node.body.length; i++) this.compileStatement(node.body[i]);
            break;

        case 'FunctionDeclaration':
            if (this.functions[node.id.name]) break;
            var funcVarReg = this.allocVar(node.id.name) % 256;
            this.compileExpression({
                type: 'FunctionExpression',
                params: node.params,
                body: node.body
            }, funcVarReg);
            break;

        case 'ReturnStatement':
            if (node.argument) this.compileExpression(node.argument, 0);
            else this.emitMovInt(0, 0);
            this.emitRet();
            break;

        case 'BreakStatement':
            if (this.loopStack.length === 0) throw new Error('break outside loop');
            this.emitJmp(this.loopStack[this.loopStack.length - 1].breakLabel);
            break;

        case 'ContinueStatement':
            if (this.loopStack.length === 0) throw new Error('continue outside loop');
            this.emitJmp(this.loopStack[this.loopStack.length - 1].continueLabel);
            break;

        case 'EmptyStatement': break;

        case 'ThrowStatement':
            var errReg = this.getTempReg(0);
            this.compileExpression(node.argument, errReg);
            this.emitPush(errReg);
            this.emitNewStr(this.getTempReg(1), '__krak_throw');
            this.emitGetGlobal(this.getTempReg(2), this.getTempReg(1));
            this.emitCallReg(this.getTempReg(3), this.getTempReg(2), 1);
            break;

        case 'TryStatement':
            this.compileStatement(node.block);
            break;

        case 'SwitchStatement':
            var discReg = this.getTempReg(14);
            this.compileExpression(node.discriminant, discReg);
            var switchEndLabel = '__switch_end_' + this.currentAddress();
            var caseLabels = [];
            var defaultLabel = null;
            for (var i = 0; i < node.cases.length; i++) {
                var c = node.cases[i];
                var cLabel = '__switch_case_' + this.currentAddress() + '_' + i;
                caseLabels.push(cLabel);
                if (c.test === null) {
                    defaultLabel = cLabel;
                } else {
                    var testReg = this.getTempReg(15);
                    this.compileExpression(c.test, testReg);
                    this.emit([this.opcodes.CMP]);
                    this.emit(this.encodeArgs('CMP', { a: discReg, b: testReg }));
                    this.emitJz(255, cLabel);
                }
            }
            if (defaultLabel) this.emitJmp(defaultLabel);
            else this.emitJmp(switchEndLabel);
            this.loopStack.push({ breakLabel: switchEndLabel, continueLabel: null });
            for (var i = 0; i < node.cases.length; i++) {
                this.setLabel(caseLabels[i]);
                for (var j = 0; j < node.cases[i].consequent.length; j++) {
                    this.compileStatement(node.cases[i].consequent[j]);
                }
            }
            this.loopStack.pop();
            this.setLabel(switchEndLabel);
            break;

        default:
            throw new Error('Unsupported statement: ' + node.type);
    }
};

JsCompiler.prototype.resolveJumps = function () {
    var K_W = this.config.lcgMul || 1664525;
    var K_I = this.config.lcgInc || 1013904223;
    function computeKeyAtAddress(initialKey, address) {
        var key = initialKey;
        for (var i = 0; i < address; i++) key = (key * K_W + K_I) & 0xFF;
        return key;
    }

    for (var i = 0; i < this.pendingJumps.length; i++) {
        var jump = this.pendingJumps[i];
        var targetAddr = this.labels[jump.label];
        if (targetAddr === undefined) throw new Error('Unknown label: ' + jump.label);
        var resetKey = computeKeyAtAddress(this.config.initialKey, targetAddr);
        var layout = this.layouts[jump.type];
        var addr = jump.address;

        for (var j = 0; j < layout.length; j++) {
            var argDef = layout[j];
            if (argDef.name === 't' || argDef.name === 'addr' || argDef.name === 'a') {
                this.bytecode[addr] = targetAddr & 0xFF;
                this.bytecode[addr + 1] = (targetAddr >> 8) & 0xFF;
                this.bytecode[addr + 2] = (targetAddr >> 16) & 0xFF;
                this.bytecode[addr + 3] = (targetAddr >> 24) & 0xFF;
                addr += 4;
            } else if (argDef.name === 'k' || argDef.name === 'key') {
                this.bytecode[addr] = resetKey;
                addr += 1;
            } else if (argDef.name === 'r' || argDef.name === 'reg') {
                addr += 1;
            } else if (argDef.type === 'INT') {
                addr += 4;
            } else {
                addr += 1;
            }
        }
    }
};

JsCompiler.prototype.encrypt = function (initialKey) {
    var encrypted = [];
    var key = initialKey;
    var K_W = this.config.lcgMul || 1664525;
    var K_I = this.config.lcgInc || 1013904223;
    for (var i = 0; i < this.bytecode.length; i++) {
        encrypted.push((this.bytecode[i] ^ key) & 0xFF);
        key = (key * K_W + K_I) & 0xFF;
    }
    return encrypted;
};

JsCompiler.prototype.compile = function (source) {
    var ast;
    try {
        ast = acorn.parse(source, { ecmaVersion: 2020 });
    } catch (e) {
        throw new Error('Parse error: ' + e.message);
    }

    var self = this;

    for (var i = 0; i < ast.body.length; i++) {
        var node = ast.body[i];
        if (node.type === 'VariableDeclaration') {
            for (var j = 0; j < node.declarations.length; j++) this.allocVar(node.declarations[j].id.name);
        }
    }

    var dynOps = this.config.dynamicOps ? Object.values(this.config.dynamicOps) : [];
    for (var i = dynOps.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = dynOps[i];
        dynOps[i] = dynOps[j];
        dynOps[j] = tmp;
    }

    var initBlocks = [];
    for (var i = 0; i < dynOps.length; i++) {
        initBlocks.push({ id: i, op: dynOps[i] });
    }

    var currentInitIndex = 0;
    var mainLabel = '__main_start';

    function tryEmitInitBlock(guarded, force) {
        while (currentInitIndex < initBlocks.length) {
            if (!force && Math.random() > 0.4) break;

            var block = initBlocks[currentInitIndex];
            var skipLabel = '__skip_init_' + block.id;

            if (guarded) self.emitJmp(skipLabel);

            self.setLabel('__init_' + block.id);
            self.emitEvalOp(block.op.src);

            var nextLabel = (currentInitIndex + 1 < initBlocks.length) ? '__init_' + (currentInitIndex + 1) : mainLabel;
            self.emitJmp(nextLabel);

            if (guarded) self.setLabel(skipLabel);

            currentInitIndex++;
            if (!force) break;
        }
    }

    function collectFunctions(node) {
        if (!node) return;
        if (node.type === 'FunctionDeclaration') {
            self.allocVar(node.id.name);
            self.functions[node.id.name] = {
                params: node.params.map(function (p) { return p.name; }),
                body: node.body
            };
            collectFunctions(node.body);
        } else if (node.type === 'BlockStatement' || node.type === 'Program') {
            if (node.body) {
                for (var i = 0; i < node.body.length; i++) collectFunctions(node.body[i]);
            }
        }
    }
    collectFunctions(ast);

    var globalVars = Object.assign({}, this.variables);
    var globalNextSlot = this.nextVarSlot;
    var hasFunctions = Object.keys(this.functions).length > 0;

    if (initBlocks.length > 0) {
        this.emitJmp('__init_0');
    } else if (hasFunctions) {
        this.emitJmp(mainLabel);
    }

    var runningSlot = globalNextSlot;

    for (var funcName in this.functions) {
        tryEmitInitBlock(false, false);
        var funcInfo = this.functions[funcName];
        this.setLabel('__func_' + funcName);
        var savedVars = this.variables;
        var savedNextSlot = this.nextVarSlot;
        this.variables = Object.assign({}, globalVars);
        this.nextVarSlot = runningSlot;
        this.variables['this'] = this.nextVarSlot++;
        for (var p = 0; p < funcInfo.params.length; p++) this.variables[funcInfo.params[p]] = this.nextVarSlot++;

        var thisReg = this.getVarReg('this');
        this.emitPop(thisReg);
        for (var p = funcInfo.params.length - 1; p >= 0; p--) {
            var paramReg = this.getVarReg(funcInfo.params[p]);
            this.emitPop(paramReg);
        }

        this.compileStatement(funcInfo.body);
        this.emitMovInt(0, 0);
        this.emitRet();
        runningSlot = this.nextVarSlot;
        this.variables = savedVars;
        this.nextVarSlot = savedNextSlot;
    }

    if (hasFunctions || initBlocks.length > 0) {
        this.setLabel(mainLabel);
    }

    for (var i = 0; i < ast.body.length; i++) {
        tryEmitInitBlock(true, false);
        this.compileStatement(ast.body[i]);
    }
    this.emit([this.opcodes.HALT]);

    tryEmitInitBlock(false, true);

    this.resolveJumps();

    var encrypted = this.encrypt(this.config.initialKey);
    var base64 = Buffer.from(encrypted).toString('base64');
    return { bytecode: encrypted, base64: base64 };
};

function compileFile(inputPath, configOrPath) {
    var source = fs.readFileSync(inputPath, 'utf8');
    var config = typeof configOrPath === 'string' ? JSON.parse(fs.readFileSync(configOrPath, 'utf8')) : configOrPath;
    var compiler = new JsCompiler(config);
    return compiler.compile(source);
}

module.exports = { compileFile, JsCompiler };
