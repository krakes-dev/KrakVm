function rotl(n, s) {
    return (n << s) | (n >>> (32 - s));
}

function compute() {
    var a = 0x67452301;
    var b = 0xEFCDAB89;
    var t = (b & 0x98BADCFE) | (~b & 0x10325476);
    var temp = (rotl(a, 5) + t + 0xC3D2E1F0 + 0x5A827999 + 42) | 0;
    return temp;
}

console.log(compute());
