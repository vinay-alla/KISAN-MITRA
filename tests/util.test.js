import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, inr, money, initials, distanceKm, fmtKm, stateFromLocation, clamp, toNumber, phoneKey, isValidIndianMobile } from '../js/util.js';

test('esc neutralises every HTML-significant character', () => {
  assert.equal(esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(esc(`it's & <b>`), 'it&#39;s &amp; &lt;b&gt;');
});

test('esc is safe for null, undefined and non-strings', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
  assert.equal(esc(42), '42');
});

test('esc output can never contain a raw angle bracket or quote', () => {
  const nasty = ['<script>', '"><svg/onload=x>', `'"<>&`, '</textarea><b>'];
  for (const s of nasty) assert.doesNotMatch(esc(s), /[<>"']/);
});

test('inr formats Indian digit grouping and survives bad input', () => {
  assert.equal(inr(1520), '₹1,520');
  assert.equal(inr(132600), '₹1,32,600');
  assert.equal(inr(0), '₹0');
  assert.equal(inr(NaN), '₹—');
  assert.equal(inr(undefined), '₹—');
  assert.equal(inr('abc'), '₹—');
});

test('money keeps paise instead of rounding storage rates', () => {
  assert.equal(money(1.5), '₹1.5');
  assert.equal(money(5.5), '₹5.5');
  assert.equal(money(4), '₹4');
  assert.equal(money(1234.567), '₹1,234.57');
  assert.equal(money(Infinity), '₹—');
});

test('initials handles blanks, single names and non-Latin names', () => {
  assert.equal(initials('Ramesh Patil'), 'RP');
  assert.equal(initials('  vikram   kulkarni  '), 'VK');
  assert.equal(initials('Madonna'), 'M');
  assert.equal(initials(''), '?');
  assert.equal(initials(null), '?');
  assert.equal(initials('रमेश पाटील'), 'रप');
});

test('distanceKm: zero for identical points, plausible for Nashik → Pune', () => {
  assert.equal(distanceKm(20, 73, 20, 73), 0);
  const d = distanceKm(19.9975, 73.7898, 18.5204, 73.8567); // Nashik → Pune
  assert.ok(d > 150 && d < 175, `got ${d}`);
});

test('fmtKm switches to metres below a kilometre', () => {
  assert.equal(fmtKm(0.42), '420 m');
  assert.equal(fmtKm(8.04), '8.0 km');
  assert.equal(fmtKm(NaN), '—');
});

test('stateFromLocation takes the last segment and has a default', () => {
  assert.equal(stateFromLocation('Nashik, Maharashtra'), 'Maharashtra');
  assert.equal(stateFromLocation('Maharashtra'), 'Maharashtra');
  assert.equal(stateFromLocation(' a , b ,  Punjab '), 'Punjab');
  assert.equal(stateFromLocation(''), 'Maharashtra');
  assert.equal(stateFromLocation(null), 'Maharashtra');
});

test('clamp and toNumber', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(toNumber('1,250'), 1250);
  assert.equal(toNumber('  12.5 '), 12.5);
  assert.equal(toNumber(''), 0);
  assert.equal(toNumber('abc', 7), 7);
  assert.equal(toNumber(null, 3), 3);
});

test('phoneKey normalises every common way of writing the same mobile number', () => {
  const same = ['+91 98765 43210', '098765-43210', '9876543210', '+91-9876543210', '91 98765 43210'];
  for (const s of same) assert.equal(phoneKey(s), '9876543210', s);
  assert.equal(phoneKey(''), '');
  assert.equal(phoneKey(null), '');
  assert.equal(phoneKey('abc'), '');
});

test('isValidIndianMobile accepts real mobiles and rejects the rest', () => {
  for (const ok of ['9876543210', '+91 98765 43210', '6000000000', '7123456789', '8999999999']) assert.equal(isValidIndianMobile(ok), true, ok);
  for (const bad of ['1234567890', '5876543210', '98765', '98765432101234', 'abcdefghij', '', null, '00000 00000']) assert.equal(isValidIndianMobile(bad), false, String(bad));
});
