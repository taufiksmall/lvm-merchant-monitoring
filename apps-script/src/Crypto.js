/**
 * Kriptografi murni JavaScript (tanpa layanan eksternal):
 *   - SHA-256 dan HMAC-SHA256
 *   - PBKDF2-HMAC-SHA256 untuk hash kata sandi
 *   - Token sesi acak
 *
 * Format hash kata sandi (kompatibel dengan scripts/hash-password.mjs dan PBKDF2 standar):
 *   pbkdf2_sha256$<iterasi>$<salt_base64>$<hash_base64>
 */

var PASSWORD_HASH_PREFIX = 'pbkdf2_sha256';
var PBKDF2_MIN_ITERATIONS = 10000;
var PBKDF2_MAX_ITERATIONS = 2000000;
var PBKDF2_DEFAULT_ITERATIONS = 100000;

var SHA256_K_ = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

var SHA256_IV_ = new Int32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/** Fungsi kompresi SHA-256: out = state + compress(state, block). `out` boleh sama dengan `state`. */
function sha256Compress_(state, block, out, w) {
  var K = SHA256_K_;
  var i, x, y, t1, t2;
  for (i = 0; i < 16; i++) w[i] = block[i];
  for (i = 16; i < 64; i++) {
    x = w[i - 15];
    y = w[i - 2];
    w[i] = (w[i - 16] +
      (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) +
      w[i - 7] +
      (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) | 0;
  }
  var a = state[0], b = state[1], c = state[2], d = state[3];
  var e = state[4], f = state[5], g = state[6], h = state[7];
  for (i = 0; i < 64; i++) {
    t1 = (h +
      (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) +
      ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
    t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) +
      ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0;
    d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  out[0] = (state[0] + a) | 0; out[1] = (state[1] + b) | 0;
  out[2] = (state[2] + c) | 0; out[3] = (state[3] + d) | 0;
  out[4] = (state[4] + e) | 0; out[5] = (state[5] + f) | 0;
  out[6] = (state[6] + g) | 0; out[7] = (state[7] + h) | 0;
}

/** Proses pesan (Uint8Array) ke state awal tertentu, termasuk padding. */
function sha256Process_(initState, bytes, prefixLen) {
  var len = bytes.length;
  var totalLen = len + (prefixLen || 0);
  var nBlocks = (len + 9 + 63) >> 6;
  var padded = new Uint8Array(nBlocks * 64);
  padded.set(bytes);
  padded[len] = 0x80;
  var bitLen = totalLen * 8;
  var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
  var n = padded.length;
  padded[n - 8] = hi >>> 24; padded[n - 7] = hi >>> 16; padded[n - 6] = hi >>> 8; padded[n - 5] = hi;
  padded[n - 4] = lo >>> 24; padded[n - 3] = lo >>> 16; padded[n - 2] = lo >>> 8; padded[n - 1] = lo;
  var state = new Int32Array(initState);
  var block = new Int32Array(16), w = new Int32Array(64);
  for (var off = 0; off < n; off += 64) {
    for (var j = 0; j < 16; j++) {
      var p = off + j * 4;
      block[j] = (padded[p] << 24) | (padded[p + 1] << 16) | (padded[p + 2] << 8) | padded[p + 3];
    }
    sha256Compress_(state, block, state, w);
  }
  return state;
}

function wordsToBytes_(words) {
  var out = new Uint8Array(words.length * 4);
  for (var i = 0; i < words.length; i++) {
    out[i * 4] = words[i] >>> 24; out[i * 4 + 1] = words[i] >>> 16;
    out[i * 4 + 2] = words[i] >>> 8; out[i * 4 + 3] = words[i];
  }
  return out;
}

function sha256Bytes_(bytes) {
  return wordsToBytes_(sha256Process_(SHA256_IV_, bytes, 0));
}

function sha256Hex_(text) {
  return bytesToHex_(sha256Bytes_(utf8Bytes_(text)));
}

function concatBytes_(a, b) {
  var out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function hmacSha256_(keyBytes, msgBytes) {
  var key = keyBytes.length > 64 ? sha256Bytes_(keyBytes) : keyBytes;
  var ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (var i = 0; i < 64; i++) {
    var k = i < key.length ? key[i] : 0;
    ipad[i] = k ^ 0x36;
    opad[i] = k ^ 0x5c;
  }
  var inner = sha256Bytes_(concatBytes_(ipad, msgBytes));
  return sha256Bytes_(concatBytes_(opad, inner));
}

/**
 * PBKDF2-HMAC-SHA256. Iterasi ke-2 dst. memakai state ipad/opad yang sudah dihitung
 * sehingga tiap iterasi hanya butuh dua kompresi SHA-256.
 */
function pbkdf2Sha256_(passwordBytes, saltBytes, iterations, dkLen) {
  var key = passwordBytes.length > 64 ? sha256Bytes_(passwordBytes) : passwordBytes;
  var ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (var i = 0; i < 64; i++) {
    var k = i < key.length ? key[i] : 0;
    ipad[i] = k ^ 0x36;
    opad[i] = k ^ 0x5c;
  }
  var w = new Int32Array(64);
  var tmpBlock = new Int32Array(16);
  var innerState = new Int32Array(8), outerState = new Int32Array(8);
  bytesToBlock_(ipad, tmpBlock);
  sha256Compress_(SHA256_IV_, tmpBlock, innerState, w);
  bytesToBlock_(opad, tmpBlock);
  sha256Compress_(SHA256_IV_, tmpBlock, outerState, w);

  // Blok pesan 32 byte setelah 64 byte pad: panjang total (64 + 32) * 8 = 768 bit.
  var innerBlock = new Int32Array(16), outerBlock = new Int32Array(16);
  innerBlock[8] = 0x80000000 | 0; innerBlock[15] = 768;
  outerBlock[8] = 0x80000000 | 0; outerBlock[15] = 768;
  var u = new Int32Array(8), t = new Int32Array(8);

  var nBlocks = Math.ceil(dkLen / 32);
  var out = new Uint8Array(nBlocks * 32);
  for (var b = 1; b <= nBlocks; b++) {
    var msg = concatBytes_(saltBytes, new Uint8Array([b >>> 24, b >>> 16, b >>> 8, b]));
    var innerFirst = sha256Process_(innerState, msg, 64);
    var u1 = sha256Process_(outerState, wordsToBytes_(innerFirst), 64);
    for (var j = 0; j < 8; j++) { u[j] = u1[j]; t[j] = u1[j]; }
    for (var it = 1; it < iterations; it++) {
      for (j = 0; j < 8; j++) innerBlock[j] = u[j];
      sha256Compress_(innerState, innerBlock, u, w);
      for (j = 0; j < 8; j++) outerBlock[j] = u[j];
      sha256Compress_(outerState, outerBlock, u, w);
      for (j = 0; j < 8; j++) t[j] ^= u[j];
    }
    out.set(wordsToBytes_(t), (b - 1) * 32);
  }
  return out.subarray(0, dkLen);
}

function bytesToBlock_(bytes64, block) {
  for (var j = 0; j < 16; j++) {
    var p = j * 4;
    block[j] = (bytes64[p] << 24) | (bytes64[p + 1] << 16) | (bytes64[p + 2] << 8) | bytes64[p + 3];
  }
}

function utf8Bytes_(str) {
  var s;
  try {
    s = unescape(encodeURIComponent(String(str)));
  } catch (e) {
    throw new AppError('VALIDATION_ERROR', 'Teks mengandung karakter yang tidak valid.');
  }
  var out = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function bytesToHex_(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return hex;
}

function hexToBytes_(hex) {
  var out = new Uint8Array(hex.length / 2);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

var B64_CHARS_ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64_(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    var n = (b0 << 16) | (b1 << 8) | b2;
    out += B64_CHARS_.charAt((n >>> 18) & 63) + B64_CHARS_.charAt((n >>> 12) & 63);
    out += i + 1 < bytes.length ? B64_CHARS_.charAt((n >>> 6) & 63) : '=';
    out += i + 2 < bytes.length ? B64_CHARS_.charAt(n & 63) : '=';
  }
  return out;
}

function base64ToBytes_(b64) {
  var s = String(b64).replace(/[\s=]/g, '');
  if (!/^[A-Za-z0-9+\/]*$/.test(s)) return null;
  var out = [];
  var buffer = 0, bits = 0;
  for (var i = 0; i < s.length; i++) {
    buffer = (buffer << 6) | B64_CHARS_.indexOf(s.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** Bandingkan dua string dengan waktu konstan (terhadap isi). */
function constantTimeEquals_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** String heksadesimal acak dari UUID v4 (java.util.UUID / SecureRandom). 32 karakter per UUID. */
function randomHex_(uuidCount) {
  var out = '';
  for (var i = 0; i < (uuidCount || 1); i++) out += Utilities.getUuid().replace(/-/g, '').toLowerCase();
  return out;
}

/** Token sesi: 64 karakter hex (dua UUID v4, ~244 bit acak). */
function newSessionToken_() {
  return randomHex_(2);
}

function hashPassword_(password, iterations) {
  var iter = clampInt_(iterations, PBKDF2_MIN_ITERATIONS, PBKDF2_MAX_ITERATIONS, PBKDF2_DEFAULT_ITERATIONS);
  var salt = hexToBytes_(randomHex_(1));
  var dk = pbkdf2Sha256_(utf8Bytes_(password), salt, iter, 32);
  return [PASSWORD_HASH_PREFIX, iter, bytesToBase64_(salt), bytesToBase64_(dk)].join('$');
}

/** Uraikan string hash. Mengembalikan null bila formatnya tidak valid. */
function parsePasswordHash_(stored) {
  var parts = str_(stored).split('$');
  if (parts.length !== 4 || parts[0] !== PASSWORD_HASH_PREFIX) return null;
  var iter = Number(parts[1]);
  if (!(iter >= 1000 && iter <= PBKDF2_MAX_ITERATIONS) || Math.floor(iter) !== iter) return null;
  var salt = base64ToBytes_(parts[2]);
  var hash = base64ToBytes_(parts[3]);
  if (!salt || salt.length < 8 || !hash || hash.length < 16) return null;
  return { iterations: iter, salt: salt, hash: hash };
}

function isValidPasswordHash_(stored) {
  return parsePasswordHash_(stored) !== null;
}

function verifyPassword_(password, stored) {
  var parsed = parsePasswordHash_(stored);
  if (!parsed) return false;
  var dk = pbkdf2Sha256_(utf8Bytes_(password), parsed.salt, parsed.iterations, parsed.hash.length);
  return constantTimeEquals_(bytesToBase64_(dk), bytesToBase64_(parsed.hash));
}

/** Jalankan PBKDF2 tanpa hasil agar waktu respons login tidak membocorkan kode cabang yang tidak ada. */
function dummyPasswordWork_() {
  pbkdf2Sha256_(utf8Bytes_('dummy-password'), new Uint8Array(16), PBKDF2_DEFAULT_ITERATIONS, 32);
}

/** Sidik jari kredensial: berubah bila password_hash diganti, sehingga sesi lama tidak berlaku. */
function credentialFingerprint_(passwordHash) {
  return sha256Hex_('fp:' + str_(passwordHash)).substring(0, 24);
}
