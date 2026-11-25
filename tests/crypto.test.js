import test from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import { sha256, pbkdf2Sha256, hashPassword, verifyPassword, isHashed, SCHEME, ITERATIONS } from '../js/crypto.js';

const enc = new TextEncoder();
const hex = (b) => Buffer.from(b).toString('hex');

/* ---------- SHA-256 against Node ---------- */

test('sha256 matches the standard test vectors', () => {
  assert.equal(hex(sha256(enc.encode(''))), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(hex(sha256(enc.encode('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    hex(sha256(enc.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
});

test('sha256 matches Node for every length around the 55/56/64-byte padding boundaries', () => {
  for (let len = 0; len <= 200; len++) {
    const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 31 + len) & 255);
    assert.equal(hex(sha256(bytes)), nodeCrypto.createHash('sha256').update(bytes).digest('hex'), `length ${len}`);
  }
});

/* ---------- PBKDF2 against Node ---------- */

test('pure-JS PBKDF2 matches the RFC 7914 / RFC 6070-style reference outputs from Node', () => {
  const cases = [
    ['password', 'salt', 1], ['password', 'salt', 2], ['password', 'salt', 4096],
    ['passwordPASSWORDpassword', 'saltSALTsaltSALTsaltSALTsaltSALTsalt', 2],
  ];
  for (const [pw, salt, iterations] of cases) {
    const expected = nodeCrypto.pbkdf2Sync(pw, salt, iterations, 32, 'sha256').toString('hex');
    assert.equal(hex(pbkdf2Sha256(enc.encode(pw), enc.encode(salt), iterations)), expected, `${pw}/${salt}/${iterations}`);
  }
});

test('pure-JS PBKDF2 handles passwords longer than the 64-byte HMAC block, empty and Unicode ones', () => {
  const salt = Uint8Array.from({ length: 16 }, (_, i) => i * 7);
  for (const pw of ['x'.repeat(65), 'y'.repeat(200), '', 'पासवर्ड🔒']) {
    const expected = nodeCrypto.pbkdf2Sync(Buffer.from(pw), Buffer.from(salt), 300, 32, 'sha256').toString('hex');
    assert.equal(hex(pbkdf2Sha256(enc.encode(pw), salt, 300)), expected, JSON.stringify(pw).slice(0, 20));
  }
});

/* ---------- public API ---------- */

test('hashPassword → verifyPassword round-trips; wrong passwords are rejected', async () => {
  const stored = await hashPassword('correct horse battery', { iterations: 2000 });
  assert.ok(isHashed(stored));
  assert.ok(stored.startsWith(`${SCHEME}$2000$`));
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('correct horse batterz', stored), false);
  assert.equal(await verifyPassword('', stored), false);
});

test('the Web Crypto path and the pure-JS fallback produce identical hashes', async () => {
  const salt = Uint8Array.from({ length: 16 }, (_, i) => 255 - i);
  const viaApi = await hashPassword('s3cret!', { salt, iterations: 1500 });
  const hash = viaApi.split('$')[3];
  assert.equal(hex(pbkdf2Sha256(enc.encode('s3cret!'), salt, 1500)), hash);

  // And the API verifies correctly when Web Crypto is unavailable (insecure-context fallback).
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: saved.get ? (a) => nodeCrypto.getRandomValues(a) : saved.value.getRandomValues.bind(saved.value) }, configurable: true });
  try {
    assert.equal(await verifyPassword('s3cret!', viaApi), true);
    assert.equal(await verifyPassword('nope', viaApi), false);
    const hashedWithoutSubtle = await hashPassword('another', { iterations: 500 });
    assert.equal(await verifyPassword('another', hashedWithoutSubtle), true);
  } finally {
    Object.defineProperty(globalThis, 'crypto', saved);
  }
});

test('each hash uses a fresh random salt', async () => {
  const a = await hashPassword('same', { iterations: 100 });
  const b = await hashPassword('same', { iterations: 100 });
  assert.notEqual(a, b);
  assert.notEqual(a.split('$')[2], b.split('$')[2]);
  assert.equal(await verifyPassword('same', a), true);
  assert.equal(await verifyPassword('same', b), true);
});

test('the stored string never contains the password', async () => {
  const stored = await hashPassword('hunter2-unique-marker', { iterations: 100 });
  assert.ok(!stored.includes('hunter2'));
});

test('default work factor is at least 100,000 iterations', async () => {
  assert.ok(ITERATIONS >= 100_000);
  assert.ok((await hashPassword('x')).startsWith(`${SCHEME}$${ITERATIONS}$`));
});

test('legacy plaintext passwords still verify (so old accounts can log in and be upgraded)', async () => {
  assert.equal(await verifyPassword('demo123', 'demo123'), true);
  assert.equal(await verifyPassword('demo124', 'demo123'), false);
  assert.equal(isHashed('demo123'), false);
});

test('malformed stored values are a plain "no match", never an exception', async () => {
  const bad = [undefined, null, '', 42, {}, 'pbkdf2-sha256$', 'pbkdf2-sha256$abc$00$00', 'pbkdf2-sha256$100$zz$00',
    'pbkdf2-sha256$100$0011$00', `pbkdf2-sha256$0$0011$${'00'.repeat(32)}`, `pbkdf2-sha256$99999999999$0011$${'00'.repeat(32)}`,
    `pbkdf2-sha256$100$$${'00'.repeat(32)}`];
  for (const b of bad) assert.equal(await verifyPassword('anything', b), false, String(b));
});
