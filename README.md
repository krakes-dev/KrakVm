<div align="center">
  <h1>🛡️ KrakVM</h1>
  <p><strong>Advanced Polymorphic JavaScript Virtual Machine for Code Protection</strong></p>

  [![Node.js Version](https://img.shields.io/badge/Node-14%2B-green.svg)](https://nodejs.org/)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
</div>

---

**KrakVM** is a highly advanced, polymorphic JavaScript Virtual Machine framework designed to protect source code against reverse engineering and static analysis. By translating standard JavaScript into a custom bytecode format, KrakVM secures your intellectual property with dynamic execution pipelines, randomized instruction sets, deep structural obfuscation, and active anti-tampering defenses.

## ✨ Core Security Features

While the preamble-based dynamic opcodes are a unique highlight, KrakVM implements a multi-layered security architecture designed to thwart offline analysis, memory dumping, and dynamic debugging.

### 🔐 1. End-to-End Bytecode Encryption (LCG)
The compiled bytecode never sits in memory in plain text. 
KrakVM encrypts the entire instruction stream compiling process using a custom Linear Congruential Generator (LCG) cipher. At runtime, the VM engine decrypts instructions pseudo-randomly "on the fly" byte-by-byte (`readByte`, `readInt32`), dynamically updating its internal key states (`xk`). Even if an attacker extracts the base64 payload, the execution flow remains mathematically masked.

### 🧬 2. Polymorphic VM Generation
Every payload generation builds a completely unique Virtual Machine execution environment:
- **Randomized Opcodes:** The byte mappings for instructions (e.g., whether `0x1A` means `ADD` or `CALL`) are pseudo-randomized uniquely for each build.
- **Layout Shuffling:** The static functions (handlers) injected into the VM engine are shuffled using a Fisher-Yates algorithm during compiler generation, ensuring no two VM builds share the same sequence of variables, array assignments, or execution signatures.
- **Register Randomization:** Temporary compiler registers are allocated unpredictably to block static pattern recognition of the underlying code's variables mapping.

### 🧨 3. Active Anti-Tampering & Execution Integrity
KrakVM actively monitors itself for unauthorized modification or debugger stepping:
- **Memory & Signature Hashing:** The VM initialization sequence hashes its internal memory footprint and function pointer signatures array. Before execution and throughout critical points, `_ver()` mathematically checks the current state against its expected hash.
- **Aggressive Memory Wiping:** If tampering is detected, the VM doesn't just error out. It actively dumps and wipes the entire context: `ctx.mem = null`, `ctx.reg.fill(0)`, `ctx.stack.length = 0`. Crucial state is destroyed instantly to prevent researchers from inspecting runtime crashes.
- **Decoy Exceptions:** When the VM crashes or detects tampering, it throws randomized decoy error strings like `Segmentation fault` or `Out of memory` by picking randomly from an array, completely hiding the real cause of failure from the attacker.

### 🧩 4. Dynamic Preamble-Based Opcodes
Traditional VMs ship with a static block of opcode definitions (e.g., `ops[0x42] = function add() {...}`). This static mapping makes the underlying execution engine predictable.
KrakVM natively **withholds 30% to 50% of the core instructions** from the generated VM footprint. The missing opcodes are injected into the VM's state *just-in-time* directly by the compiled bytecode itself via uniquely generated `EVAL` instructions. The VM physically lacks the ability to execute its program until the bytecode payload natively repairs the engine mid-flight.

### 🍝 5. "Spaghetti" Initialization Chains
To prevent basic string extraction from the bytecode preamble, the missing dynamic opcode configurations (`EVAL` definitions) are not clustered sequentially. 
The compiler fragments the setup logic into scattered blocks woven unpredictably throughout the entire bytecode AST. Execution begins by jumping (via `JMP`) to an obscure initialization node, evaluating a subset of the missing environment, and bouncing erratically across mutual bridge labels hidden deep within the code layout before finally launching the actual main execution sequence.

### 🌪️ 6. Deep Structural Polymorphism
To defeat AST fingerprinting and signature-based detection, KrakVM completely morphs its internal JavaScript codebase structure on every compilation:
- **AST Shape-Shifting:** Common logic barriers and loops (like `while` statements or strict bitwise bounds) are procedurally converted into functionally equivalent but syntactically distinct structures (e.g. `for` loops or chained negations like `~(~a ^ b)`).
- **Mathematical Masking:** Hardcoded limits and initializing variables (like `MAX_STACK`, `MAX_FRAMES`, or error matrices) are dynamically replaced with randomly generated mathematical polynomials (e.g., evaluating `(45000 - X + X)` at runtime).
- **Context Property Scrambling:** The entire VM property namespace (registers, memory layouts, instruction pointers like `ip` and `xk`) is aggressively randomized into unique 6-digit hex identifiers each build.

### 🛡️ 7. True Polymorphic Anti-Sandbox Codec
Strings and sensitive bytecode configs aren't just conventionally encrypted; they are shielded by a custom, self-synthesizing AST engine:
- **Algorithm Synthesis:** Instead of a static string cipher, KrakVM synthesizes a completely new mathematical decoding algorithm (`ADD`, `XOR`, `NOT`, etc.) from scratch per-build. The AST for the decoder is then uniquely constructed to functionally reverse this specific math chain.
- **Scattered State Dependencies:** The decoding mechanism is intentionally crippled out-of-the-box. It relies on cryptographic variables (alphabet fragments and stream cipher seeds) injected at random, non-contiguous locations globally within the script. If an analyst tries to extract the decoder function to run in a sandbox, it crashes instantly out of context.
- **Native Minification:** Payload generation is automatically piped through an internal synchronous `uglify-js` compiler step, permanently erasing whitespace, compacting operations, and shrinking the overall raw VM execution footprint by over 35%.

---

## 🚀 Installation

Clone the repository and run the setup (requires Node.js):

```bash
git clone https://github.com/krakes-dev/KrakVm.git
cd KrakVm
npm install
```

## 🛠️ Usage

You can test KrakVM locally by passing a standard JavaScript file through the build system.

1. Create your target JavaScript file (e.g., `input.js`).
2. Run the build pipeline via the index framework:

```javascript
const { build } = require('./src/index.js');

// Compile input.js into a protected virtual machine script
build('input.js', 'output.protected.js');
```

3. Execute the protected script natively:

```bash
node output.protected.js
```

## 🏗️ Internal Architecture

- ⚙️ `src/vm/core.js` - The generic VM engine framework, execution loop, active integrity checks, and LCG memory handlers.
- 🔧 `src/vm/handlers.js` - The individual JavaScript function handlers for generic opcodes (sliced apart during generation).
- 🧬 `src/compiler/generator.js` - Slices, shuffles, and pseudo-randomizes the `handlers` logic into unique VM definitions.
- 🧠 `src/compiler/compiler.js` - Parses JavaScript AST (via `acorn`) and generates the custom encrypted bytecode, wrapping it with the dynamic `EVAL` spaghetti preamble configurations.

## 🧪 Testing

Run the included benchmark testing suites to ensure the VM is correctly validating execution states and to verify the polymorphic layout sequences:

```bash
npm test
```

## 🛡️ Best Security Practices

While KrakVM provides advanced dynamic code execution to drastically slow down, confuse, and deter static reverse engineering analysis (such as AST lifting and pattern matching), no JavaScript protection is mathematically absolute in the browser/Node environment. KrakVM is best coupled with supplementary external obfuscation (e.g., control-flow flattening, string hiding) on the final generated wrapper to achieve maximum robustness.

## 📞 Contact

For inquiries, discussions or **paid projects / freelance work**:  
**Telegram:** [@azulax1](https://t.me/azulax1)  
**Discord:** dch002

## 📄 License

This project is licensed under the MIT License.
