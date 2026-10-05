'use strict';

// SHA-256 over bounded UTF-8 program data. No native API, ambient encoding
// service or host callback is endowed to the proof compartment. The native
// TCB digest remains unchanged and is the differential test oracle only.
const K = Object.freeze([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const rotate = (value, amount) => value >>> amount | value << (32 - amount);
function sha256Utf8(text) {
    if (typeof text !== 'string' || text.length > 1048576) throw new Error('proof_sha256_input');
    const bytes = new Uint8Array(text.length * 3 + 72);
    let length = 0;
    for (let index = 0; index < text.length; index++) {
        let code = text.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const low = text.charCodeAt(index + 1);
            if (low >= 0xdc00 && low <= 0xdfff) { code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00; index++; }
            else code = 0xfffd;
        } else if (code >= 0xdc00 && code <= 0xdfff) code = 0xfffd;
        if (code < 0x80) bytes[length++] = code;
        else if (code < 0x800) { bytes[length++] = 0xc0 | code >>> 6; bytes[length++] = 0x80 | code & 63; }
        else if (code < 0x10000) {
            bytes[length++] = 0xe0 | code >>> 12; bytes[length++] = 0x80 | code >>> 6 & 63; bytes[length++] = 0x80 | code & 63;
        } else {
            bytes[length++] = 0xf0 | code >>> 18; bytes[length++] = 0x80 | code >>> 12 & 63;
            bytes[length++] = 0x80 | code >>> 6 & 63; bytes[length++] = 0x80 | code & 63;
        }
    }
    const total = Math.ceil((length + 9) / 64) * 64;
    bytes[length] = 0x80;
    // The bounded input is below 2^29 bytes, hence its bit length fits uint32;
    // the high half of the required uint64 length remains zero-initialized.
    const bits = length * 8;
    for (let index = 0; index < 4; index++) bytes[total - 1 - index] = bits >>> (index * 8) & 255;
    const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const words = new Uint32Array(64);
    for (let block = 0; block < total; block += 64) {
        for (let index = 0; index < 16; index++) {
            const at = block + index * 4;
            words[index] = bytes[at] << 24 | bytes[at + 1] << 16 | bytes[at + 2] << 8 | bytes[at + 3];
        }
        for (let index = 16; index < 64; index++) {
            const a = words[index - 15]; const b = words[index - 2];
            words[index] = words[index - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ a >>> 3)
                + words[index - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ b >>> 10);
        }
        let [a, b, c, d, e, f, g, h] = state;
        for (let index = 0; index < 64; index++) {
            const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25))
                + ((e & f) ^ (~e & g)) + K[index] + words[index]) >>> 0;
            const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22))
                + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            h = g; g = f; f = e; e = d + first >>> 0; d = c; c = b; b = a; a = first + second >>> 0;
        }
        for (const [index, value] of [a, b, c, d, e, f, g, h].entries()) state[index] = state[index] + value >>> 0;
    }
    return state.map(value => value.toString(16).padStart(8, '0')).join('');
}
module.exports = { sha256Utf8 };
