import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/env.js';

const { api, ApiError } = await import('../js/api.js');
const D = await import('../js/data.js');
const { store } = await import('../js/store.js');
const remote = await import('../js/remote.js');

const realFetch = globalThis.fetch;
const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('no body'); return body; } });
test.afterEach(() => { globalThis.fetch = realFetch; api.setToken(null); });

test('detect(): a real backend is recognised', async () => {
  globalThis.fetch = reply(200, { status: 'ok', demoMode: true, liveMandi: false });
  assert.equal(await api.detect(), true);
  assert.equal(api.online, true);
  assert.equal(api.demoMode, true);
});

test('detect(): a static host (404, HTML fallback, network error) means offline mode', async () => {
  for (const f of [reply(404, undefined), reply(200, undefined), reply(200, { hello: 'world' }), async () => { throw new TypeError('network'); }]) {
    globalThis.fetch = f;
    assert.equal(await api.detect(), false);
    assert.equal(api.online, false);
  }
});

test('requests use relative URLs and send the bearer token', async () => {
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ ok: 1 }) }; };
  api.setToken('abc.def');
  await api.post('api/lots', { crop: 'Onion' });
  assert.equal(seen.url, './api/lots');
  assert.equal(seen.init.headers.Authorization, 'Bearer abc.def');
  assert.equal(seen.init.body, JSON.stringify({ crop: 'Onion' }));
});

test('error responses become ApiError with the server code and message', async () => {
  globalThis.fetch = reply(409, { error: { code: 'trip_full', message: 'This trip is full.' } });
  await assert.rejects(() => api.post('api/trips/ST1/book', { qty: 5 }), (e) => e instanceof ApiError && e.status === 409 && e.code === 'trip_full' && e.message === 'This trip is full.');
});

test('a dropped connection is a friendly ApiError, not a raw TypeError', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => api.get('api/sync'), (e) => e instanceof ApiError && e.code === 'network');
});

test('an expired token triggers the session-expiry hook', async () => {
  let fired = 0;
  api.onUnauthorized(() => { fired += 1; });
  api.setToken('old.token');
  globalThis.fetch = reply(401, { error: { code: 'invalid_token', message: 'Your session has expired.' } });
  await assert.rejects(() => api.get('api/sync'));
  assert.equal(fired, 1);
  // a failed login is a 401 too, but must not look like an expired session
  globalThis.fetch = reply(401, { error: { code: 'invalid_credentials', message: 'Incorrect phone number or password.' } });
  await assert.rejects(() => api.post('api/auth/login', {}, { auth: false }));
  assert.equal(fired, 1);
  api.onUnauthorized(null);
});

test('offline mode keeps using the built-in sample data, deduplicated', () => {
  store.resetAll();
  store.login({ role: 'farmer', name: 'T', fullName: 'T', phone: '9000000000', location: 'X' });
  assert.equal(remote.isRemote(), false);
  store.createLot({ ...D.LOTS[0], quantity: 99 });   // an edited copy of a sample lot
  const lots = remote.allLots();
  assert.equal(lots.filter((l) => l.id === D.LOTS[0].id).length, 1);
  assert.equal(lots.find((l) => l.id === D.LOTS[0].id).quantity, 99, 'the farmer’s copy wins');
  assert.equal(remote.marketLots(), D.AVAILABLE_LOTS);
  assert.equal(remote.livePools()[0].pooledQty, D.POOLS[0].pooledQty);
});

test('applyServerState replaces server-owned data and clearUserData wipes it on sign-out', () => {
  store.resetAll();
  store.login({ role: 'buyer', name: 'B', fullName: 'B', phone: '9000000001', location: 'X' });
  store.applyServerState({ offers: [{ id: 'OFR-1' }], orders: [{ id: 'ORD-1' }], poolOthers: { P1: 80 }, marketLots: [{ id: 'LOT-9' }], unreadNotifications: 3, bookings: [{ type: 'storage', name: 'S', date: 1795608667272 }] });
  const s = store.get();
  assert.deepEqual([s.offers.length, s.orders.length, s.remote.poolOthers.P1, s.remote.unread], [1, 1, 80, 3]);
  assert.match(s.bookings[0].date, /\d{4}$/);
  store.clearUserData();
  assert.deepEqual([store.get().offers, store.get().orders, store.get().user], [[], [], null]);
});

test('store actions reach the hook; server-state application never does (no echo loops)', async () => {
  const { onStoreAction } = await import('../js/store.js');
  const seen = [];
  onStoreAction((type) => seen.push(type));
  store.resetAll();
  store.addGrievance({ id: 'GR-1', type: 'Other', description: 'x'.repeat(12) });
  store.setPoolContribution('P1', 5);
  store.applyServerState({ grievances: [] });
  onStoreAction(null);
  assert.deepEqual(seen, ['grievance:add', 'pool:set']);
});
