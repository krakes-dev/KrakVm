function outer(a, b) {
    function inner(x) {
        return x * 3;
    }
    return inner(a) + inner(b);
}

console.log(outer(1, 4));
console.log(outer(5, 5));
