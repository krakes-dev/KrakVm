function sha1(msg) {
    function rotl(n, s) {
        return (n << s) | (n >>> (32 - s));
    }

    var s = unescape(encodeURIComponent(msg));
    var l = s.length;
    var w = new Uint32Array(80);
    var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;

    var words = new Uint32Array(((l + 8) >> 6) + 1 << 4);
    for (var i = 0; i < l; i++) words[i >> 2] |= s.charCodeAt(i) << (24 - (i % 4) * 8);
    words[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    words[words.length - 1] = l * 8;

    for (var i = 0; i < words.length; i += 16) {
        for (var t = 0; t < 16; t++) w[t] = words[i + t];
        for (var t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);

        var a = h0, b = h1, c = h2, d = h3, e = h4;

        for (var t = 0; t < 80; t++) {
            var f, k;
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

            var temp = (rotl(a, 5) + f + e + k + w[t]) | 0;
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

    var res = [h0, h1, h2, h3, h4];
    return res.map(function (x) { return ("00000000" + (x >>> 0).toString(16)).slice(-8); }).join('');
}

console.log(sha1("hello"));
console.log(sha1("dch on top"));
console.log(sha1("abc123"));
