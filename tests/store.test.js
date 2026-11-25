import test from 'node:test';
import assert from 'node:assert/strict';
import { resetStorage } from './helpers/env.js';

const { store, sanitizeState, defaultState, ROLES, LANGUAGES, STORAGE_KEY } = await import('../js/store.js');

/* ---------- sanitizeState: untrusted storage can never break the app ---------- */

test('non-object payloads fall back to defaults', () => {
  for (const junk of [null, undefined, [], 'text', 42, true]) {
    assert.deepEqual(sanitizeState(junk), defaultState());
  }
});

test('wrongly-typed values are dropped, correctly-typed ones are kept', () => {
  const s = sanitizeState({ offers: 'oops', orders: { a: 1 }, lots: [{ id: 'L1' }], language: 5, fpoJoined: 'yes', lotStatus: [], voiceEnabled: false });
  assert.deepEqual(s.offers, []);
  assert.deepEqual(s.orders, []);
  assert.deepEqual(s.lots, [{ id: 'L1' }]);
  assert.equal(s.language, 'English');
  assert.equal(s.fpoJoined, true);
  assert.deepEqual(s.lotStatus, {});
  assert.equal(s.voiceEnabled, false);
});

test('a user with an unknown or missing role is logged out', () => {
  assert.equal(sanitizeState({ user: { role: 'admin', name: 'x' } }).user, null);
  assert.equal(sanitizeState({ user: { name: 'no role' } }).user, null);
  assert.equal(sanitizeState({ user: 'ramesh' }).user, null);
  assert.equal(sanitizeState({ user: [] }).user, null);
  for (const role of ROLES) assert.equal(sanitizeState({ user: { role, name: 'ok' } }).user.role, role);
});

test('only the three supported languages survive', () => {
  for (const l of LANGUAGES) assert.equal(sanitizeState({ language: l }).language, l);
  assert.equal(sanitizeState({ language: 'Klingon' }).language, 'English');
});

test('malformed accounts are filtered out so findAccount can never throw', () => {
  const s = sanitizeState({ accounts: [null, 7, { phone: 123 }, { phone: '+91 99999 11111', name: 'ok' }, 'x'] });
  assert.equal(s.accounts.length, 1);
  assert.equal(s.accounts[0].name, 'ok');
});

test('unknown keys are discarded and the defaults object is never mutated', () => {
  const defaults = defaultState();
  const frozen = JSON.stringify(defaults);
  const s = sanitizeState({ evil: '<script>', __proto__: { polluted: true }, language: 'हिंदी' }, defaults);
  assert.equal(s.evil, undefined);
  assert.equal(({}).polluted, undefined);
  assert.equal(JSON.stringify(defaults), frozen);
  assert.equal(s.language, 'हिंदी');
});

test('the store loads safely from corrupt JSON in localStorage', async () => {
  localStorage.setItem(STORAGE_KEY, '{ not valid json');
  const mod = await import(`../js/store.js?corrupt=${Date.now()}`);
  assert.deepEqual(mod.store.get(), defaultState());
});

/* ---------- store actions ---------- */

function fresh() { resetStorage(); store.resetAll(); }

test('accepting an offer records when, and cancelling undoes it completely', () => {
  fresh();
  const before = Date.now();
  store.acceptOption('LOT-1', 'opt1');
  store.setLotStatus('LOT-1', 'Offer Accepted');
  store.addOrder({ id: 'ORD-1', lotId: 'LOT-1', stage: 0 });
  store.addOrder({ id: 'ORD-2', lotId: 'LOT-2', stage: 0 });
  assert.equal(store.getAcceptedOption('LOT-1'), 'opt1');
  assert.ok(store.getOfferAcceptedAt('LOT-1') >= before);

  store.cancelOffer('LOT-1', 'Recommendation Ready');
  assert.equal(store.getAcceptedOption('LOT-1'), undefined);
  assert.equal(store.getOfferAcceptedAt('LOT-1'), undefined);
  assert.equal(store.getLotStatus('LOT-1', 'x'), 'Recommendation Ready');
  assert.deepEqual(store.get().orders.map((o) => o.id), ['ORD-2'], 'only the cancelled lot’s order is removed');
});

test('cancelling an offer that was never accepted is a harmless no-op', () => {
  fresh();
  assert.doesNotThrow(() => store.cancelOffer('NOPE'));
  assert.equal(store.getLotStatus('NOPE', 'x'), 'Recommendation Ready');
});

test('grievances are stored newest-first and can be updated in place', () => {
  fresh();
  store.addGrievance({ id: 'GRV-1', status: 'Submitted' });
  store.addGrievance({ id: 'GRV-2', status: 'Submitted' });
  assert.deepEqual(store.get().grievances.map((g) => g.id), ['GRV-2', 'GRV-1']);
  store.updateGrievance('GRV-1', { status: 'Under Review' });
  assert.equal(store.get().grievances.find((g) => g.id === 'GRV-1').status, 'Under Review');
  assert.equal(store.get().grievances.find((g) => g.id === 'GRV-2').status, 'Submitted');
});

test('pool contributions and shared-trip bookings can be set and cleared', () => {
  fresh();
  store.setPoolContribution('P1', 30);
  store.setPoolContribution('P2', 10);
  assert.deepEqual(store.get().poolContributions, { P1: 30, P2: 10 });
  store.clearPoolContribution('P1');
  assert.deepEqual(store.get().poolContributions, { P2: 10 });

  store.setSharedTripBooking('ST1', { qty: 12 });
  assert.deepEqual(store.get().sharedTripBookings.ST1, { qty: 12 });
  store.clearSharedTripBooking('ST1');
  assert.deepEqual(store.get().sharedTripBookings, {});
});

test('state persists to localStorage and resetAll really clears it', () => {
  fresh();
  store.setPoolContribution('P3', 5);
  assert.ok(JSON.parse(localStorage.getItem(STORAGE_KEY)).poolContributions.P3 === 5);
  store.resetAll();
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
  assert.deepEqual(store.get(), defaultState());
});

test('findAccount matches phone numbers regardless of formatting', () => {
  fresh();
  store.createAccount({ phone: '+91 98765 43210', name: 'Ramesh', role: 'farmer' });
  assert.equal(store.findAccount('9876543210')?.name, 'Ramesh');
  assert.equal(store.findAccount('+91-98765-43210')?.name, 'Ramesh');
  assert.equal(store.findAccount('111'), undefined);
  assert.equal(store.findAccount(''), undefined);
});
