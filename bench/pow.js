function sha1(msg) {
    function rotl(n, s) {
        return (n << s) | (n >>> (32 - s));
    }

    let s = unescape(encodeURIComponent(msg));
    let l = s.length;
    let w = new Uint32Array(80);
    let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;

    let words = new Uint32Array(((l + 8) >> 6) + 1 << 4);
    for (let i = 0; i < l; i++) words[i >> 2] |= s.charCodeAt(i) << (24 - (i % 4) * 8);
    words[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    words[words.length - 1] = l * 8;

    for (let i = 0; i < words.length; i += 16) {
        for (let t = 0; t < 16; t++) w[t] = words[i + t];
        for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);

        let a = h0, b = h1, c = h2, d = h3, e = h4;

        for (let t = 0; t < 80; t++) {
            let f, k;
            if (t < 20) {
                f = (b & c) | (~b & d);
                k = 0x5A827999;
            } else if (t < 40) {
                f = b ^ c ^ d;
                k = 0x6ED9EBA1;
            } else if (t < 60) {
                f = (b & c) | (b & d) | (c & d);
                k = 0x8F1BBCDC;
            } else {
                f = b ^ c ^ d;
                k = 0xCA62C1D6;
            }

            let temp = (rotl(a, 5) + f + e + k + w[t]) | 0;
            e = d;
            d = c;
            c = rotl(b, 30);
            b = a;
            a = temp;
        }

        h0 = (h0 + a) | 0;
        h1 = (h1 + b) | 0;
        h2 = (h2 + c) | 0;
        h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0;
    }

    let res = [h0, h1, h2, h3, h4];
    return res.map(x => ("00000000" + (x >>> 0).toString(16)).slice(-8)).join('');
}

function run_pow(difficulty) {
    let nonce = 0;
    let target = "0".repeat(difficulty);
    let start = Date.now();
    let input = "hashcat_test_";

    while (true) {
        let hash = sha1(input + nonce);
        if (hash.substring(0, difficulty) === target) {
            let end = Date.now();
            return {
                nonce: nonce,
                hash: hash,
                duration: (end - start) / 1000
            };
        }
        nonce++;
    }
}

let result = run_pow(2);
console.log("Status: OK");
console.log("Nonce: " + result.nonce);
console.log("Hash: " + result.hash);
console.log("Performance: " + result.duration + " seconds");