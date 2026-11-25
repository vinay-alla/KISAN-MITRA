// Password hashing for the prototype's local accounts: PBKDF2-HMAC-SHA-256 with a random
// per-account salt. Uses the Web Crypto API where it exists; falls back to a pure-JS
// implementation of the same algorithm (Web Crypto's `subtle` is unavailable on plain-http
// pages that aren't localhost, e.g. when demoing from a phone over the LAN). Both paths
// produce identical output, so a hash is valid whichever one made it — tests assert that
// against Node's own crypto.
//
// This protects against reading passwords out of localStorage. It is NOT a substitute for
// server-side authentication — see "Known limitations" in the README.

export const SCHEME = 'pbkdf2-sha256';
export const ITERATIONS = 100_000;
const HASH_BYTES = 32;
const SALT_BYTES = 16;
const encoder = new TextEncoder();

/* ---------------- SHA-256 (pure JS) ---------------- */

const K = Uint32Array.of(
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
);
const IV = Uint32Array.of(0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19);
const W = new Uint32Array(64);
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

// Process one 64-byte block (16 big-endian words) into the running state H.
function compress(H, M) {
  for (let i = 0; i < 16; i++) W[i] = M[i];
  for (let i = 16; i < 64; i++) {
    const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
    const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let [a, b, c, d, e, f, g, h] = H;
  for (let i = 0; i < 64; i++) {
    const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
    const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
  H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
}

// Hash `bytes`, starting from `state`, as if `prefixLen` bytes had already been absorbed.
function hashFrom(bytes, state = IV, prefixLen = 0) {
  const H = Uint32Array.from(state);
  const len = bytes.length;
  const padded = new Uint8Array(Math.ceil((len + 9) / 64) * 64);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLen = (prefixLen + len) * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  const M = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let j = 0; j < 16; j++) M[j] = view.getUint32(off + j * 4);
    compress(H, M);
  }
  return H;
}

function wordsToBytes(words) {
  const out = new Uint8Array(words.length * 4);
  const view = new DataView(out.buffer);
  words.forEach((w, i) => view.setUint32(i * 4, w));
  return out;
}

export function sha256(bytes) { return wordsToBytes(hashFrom(bytes)); }

/* ---------------- PBKDF2-HMAC-SHA-256 (pure JS) ---------------- */

// HMAC of a 32-byte message, resuming from precomputed inner/outer pad states (two block
// compressions per call) — this is the hot loop, run `iterations` times.
function hmacOf32(istate, ostate, msg) {
  const block = new Uint32Array(16);
  block.set(msg);
  block[8] = 0x80000000;
  block[15] = (64 + 32) * 8;
  const inner = Uint32Array.from(istate);
  compress(inner, block);
  block.fill(0);
  block.set(inner);
  block[8] = 0x80000000;
  block[15] = (64 + 32) * 8;
  const outer = Uint32Array.from(ostate);
  compress(outer, block);
  return outer;
}

export function pbkdf2Sha256(passwordBytes, saltBytes, iterations) {
  const key = new Uint8Array(64);
  key.set(passwordBytes.length > 64 ? sha256(passwordBytes) : passwordBytes);
  const toWords = (bytes) => { const v = new DataView(bytes.buffer); return Uint32Array.from({ length: 16 }, (_, i) => v.getUint32(i * 4)); };
  const istate = Uint32Array.from(IV);
  const ostate = Uint32Array.from(IV);
  compress(istate, toWords(key.map((b) => b ^ 0x36)));
  compress(ostate, toWords(key.map((b) => b ^ 0x5c)));

  // U1 = HMAC(key, salt || INT_32_BE(1)) — the one HMAC whose message isn't 32 bytes.
  const msg = new Uint8Array(saltBytes.length + 4);
  msg.set(saltBytes);
  msg[msg.length - 1] = 1;
  const innerDigest = hashFrom(msg, istate, 64);
  const block = new Uint32Array(16);
  block.set(innerDigest);
  block[8] = 0x80000000;
  block[15] = (64 + 32) * 8;
  let U = Uint32Array.from(ostate);
  compress(U, block);

  const T = Uint32Array.from(U);
  for (let i = 1; i < iterations; i++) {
    U = hmacOf32(istate, ostate, U);
    for (let j = 0; j < 8; j++) T[j] ^= U[j];
  }
  return wordsToBytes(T);
}

/* ---------------- public API ---------------- */

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
function fromHex(hex) {
  if (typeof hex !== 'string' || hex.length % 2 || /[^0-9a-f]/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g) || [], (h) => parseInt(h, 16));
}

async function derive(password, salt, iterations) {
  const pw = encoder.encode(password);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const key = await subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']);
      return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BYTES * 8));
    } catch { /* fall through to the pure-JS implementation */ }
  }
  return pbkdf2Sha256(pw, salt, iterations);
}

// Compare without bailing out at the first differing byte.
function constantTimeEqual(a, b) {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith(`${SCHEME}$`);
}

// Returns "pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>".
export async function hashPassword(password, { salt, iterations = ITERATIONS } = {}) {
  const s = salt ?? globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(String(password), s, iterations);
  return `${SCHEME}$${iterations}$${toHex(s)}$${toHex(hash)}`;
}

// Never throws: malformed input is simply "not a match".
export async function verifyPassword(password, stored) {
  try {
    if (typeof stored !== 'string' || !stored) return false;
    if (!isHashed(stored)) return constantTimeEqual(encoder.encode(String(password)), encoder.encode(stored)); // legacy plaintext
    const [, iterText, saltHex, hashHex] = stored.split('$');
    const iterations = Number(iterText);
    const salt = fromHex(saltHex);
    const expected = fromHex(hashHex);
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000_000 || !salt || !salt.length || !expected || expected.length !== HASH_BYTES) return false;
    return constantTimeEqual(await derive(String(password), salt, iterations), expected);
  } catch {
    return false;
  }
}
