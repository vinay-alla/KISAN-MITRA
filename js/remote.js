// Backend sync: mirrors the signed-in user's data between the local store and the server.
//
// Local-first: every action updates the store immediately (so the UI never waits), then this
// module sends it to the API in order. After each batch it pulls the authoritative state back,
// so server-side rules (seat limits, pool capacity, who won a bid) always win. With no backend
// — or a session that was never signed in to one — none of this runs and the app is purely local.
import { api, ApiError } from './api.js';
import { store, onStoreAction } from './store.js';
import { toast } from './ui.js';
import * as D from './data.js';

const POLL_MS = 60000;   // safety net only: the live stream below is the primary channel
let queue = Promise.resolve();
let pending = 0;
let pullTimer = null;
let pollTimer = null;
let started = false;

// "Remote mode" = a backend is reachable AND this session belongs to a server account.
export const isRemote = () => api.online && !!api.token && !!store.get().user;

/* ---------- data accessors that respect the mode (server data replaces the built-in samples) ---------- */

function dedupe(list) {
  const seen = new Set();
  return list.filter((x) => x && !seen.has(x.id) && seen.add(x.id));
}
export function allLots() {
  const mine = store.get().lots || [];
  return isRemote() ? mine : dedupe([...mine, ...D.LOTS]);
}
export function allOrders() {
  const mine = store.get().orders || [];
  return isRemote() ? dedupe(mine) : dedupe([...mine, ...D.ORDERS]);
}
// Lots buyers can bid on: the built-in samples plus every real farmer's open lots.
export function marketLots() {
  return isRemote() ? [...D.AVAILABLE_LOTS, ...(store.get().remote.marketLots || [])] : D.AVAILABLE_LOTS;
}
// Pools / trips with the live totals other people's actions have produced.
export function livePools() {
  const others = store.get().remote.poolOthers || {};
  return D.POOLS.map((p) => (isRemote() && others[p.id] != null ? { ...p, pooledQty: others[p.id] } : p));
}
export function liveTrips() {
  const others = store.get().remote.tripOthers || {};
  return D.SHARED_TRIPS.map((t) => (isRemote() && others[t.id] != null ? { ...t, bookedQtl: others[t.id] } : t));
}

/* ---------- pulling ---------- */

// notify=true is for background polls: if someone else's action changed what we show, tell the app to
// re-render. Pulls that follow our own writes stay quiet — the page already shows the optimistic result.
export async function pull({ notify = false } = {}) {
  if (!isRemote()) return;
  const before = signature();
  const snap = await api.get('api/sync');
  store.applyServerState(snap);
  if (notify && signature() !== before) window.dispatchEvent(new CustomEvent('km:synced'));
}

// What a page could be showing that someone else's action may have changed.
function signature() {
  const s = store.get();
  return JSON.stringify([s.offers, s.orders, s.grievances, s.lotStatus, s.remote, s.sharedTripBookings, s.poolContributions, s.lots]);
}

function schedulePull(delay = 150) {
  clearTimeout(pullTimer);
  pullTimer = setTimeout(() => { if (pending === 0) pull().catch(() => {}); else schedulePull(300); }, delay);
}

/* ---------- pushing ---------- */

const PROFILE_FIELDS = ['fullName', 'location', 'company', 'fpo', 'language', 'weather', 'designation'];

const HANDLERS = {
  'grievance:add': (g) => api.post('api/grievances', { id: g.id, type: g.type, description: g.description, ref: g.ref || '' }),
  'grievance:update': ({ id, patch }) => (patch.status ? api.post(`api/grievances/${id}/advance`) : null),
  'pool:set': ({ poolId, qty }) => api.put(`api/pools/${poolId}/contribution`, { qty }),
  'pool:clear': ({ poolId }) => api.del(`api/pools/${poolId}/contribution`),
  'trip:set': ({ tripId, booking }) => api.post(`api/trips/${tripId}/book`, { qty: booking.qty }),
  'trip:clear': ({ tripId }) => api.del(`api/trips/${tripId}/book`),
  'booking:add': (b) => api.post('api/bookings', { type: b.type, name: b.name }),
  'lot:create': (l) => api.post('api/lots', { id: l.id, crop: l.crop, quantity: l.quantity, grade: l.grade, harvestDate: l.harvestDate, location: l.location, photo: l.userPhoto }),
  'lot:update': (l) => api.patch(`api/lots/${l.id}`, { quantity: l.quantity, grade: l.grade }),
  'offer:add': (o) => api.post('api/offers', { id: o.id, lotId: o.lotId, farmerLotId: o.farmerLotId, price: o.price, quantity: o.quantity }),
  'offer:withdraw': ({ id }) => api.post(`api/offers/${id}/withdraw`),
  'offer:cancel': ({ lotId, revertStatus }) => api.post(`api/lots/${lotId}/cancel-accept`, { revertStatus }),
  'order:add': ({ order, optionId, offerId }) => api.post(`api/lots/${order.lotId}/accept`, {
    optionId: String(optionId || 'option'), offerId, orderId: order.id, buyer: order.buyer, rate: order.rate,
  }),
  'order:stage': ({ id, stage }) => api.post(`api/orders/${id}/stage`, { stage }),
  'user:update': (patch) => {
    const body = Object.fromEntries(Object.entries(patch).filter(([k, v]) => PROFILE_FIELDS.includes(k) && v != null));
    return Object.keys(body).length ? api.patch('api/me', body) : null;
  },
};

// Entities that only exist in the built-in samples (never on the server) 404 harmlessly.
const QUIET_404 = new Set(['order:stage', 'lot:update', 'offer:cancel']);

function enqueue(type, payload) {
  const run = HANDLERS[type];
  if (!run) return;
  pending += 1;
  queue = queue
    .then(() => run(payload))
    .catch((err) => {
      if (!(err instanceof ApiError)) { console.error(err); return; }
      if (err.code === 'invalid_token' || err.code === 'unauthenticated') return;   // handled by the session-expiry hook
      if (err.status === 404 && QUIET_404.has(type)) return;
      toast(err.message, { tone: 'error' });
    })
    .finally(() => { pending -= 1; if (pending === 0) schedulePull(); });
}

/* ---------- live stream (Server-Sent Events) ---------- */

let source = null;
let retryTimer = null;
let retryDelay = 2000;
let live = false;
export const isLive = () => live;

function setLive(on) {
  if (live === on) return;
  live = on;
  window.dispatchEvent(new CustomEvent('km:live', { detail: on }));
}

export async function connectLive() {
  disconnectLive();
  if (!isRemote() || typeof EventSource !== 'function') return;
  try {
    const { ticket } = await api.post('api/stream/ticket', {});
    // Relative URL, like every other API call (works at a domain root or behind a sub-path proxy).
    const base = (() => { try { return localStorage.getItem('kisanmitra:apiBase') || ''; } catch { return ''; } })().replace(/\/+$/, '');
    source = new EventSource(`${base ? base + '/' : './'}api/stream?ticket=${encodeURIComponent(ticket)}`);
  } catch {
    scheduleReconnect();
    return;
  }
  source.addEventListener('hello', () => { setLive(true); retryDelay = 2000; schedulePullNotify(0); });
  // Anything another person did that we might be showing: re-read, and re-render if it changed.
  for (const type of ['market', 'pools', 'trips', 'resync']) source.addEventListener(type, () => schedulePullNotify());
  source.addEventListener('notification', (e) => {
    try {
      const n = JSON.parse(e.data);
      toast(n.title, { icon: 'bell' });
    } catch { /* ignore malformed event */ }
    store.set({ remote: { ...store.get().remote, unread: (store.get().remote.unread || 0) + 1 } });
    window.dispatchEvent(new CustomEvent('km:unread'));
    schedulePullNotify();
  });
  // EventSource retries by itself, but our one-minute ticket would be stale: reconnect with a fresh one.
  source.onerror = () => { setLive(false); disconnectLive(false); scheduleReconnect(); };
}

export function disconnectLive(clearRetry = true) {
  if (source) { source.close(); source = null; }
  if (clearRetry) clearTimeout(retryTimer);
  setLive(false);
}

function scheduleReconnect() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { if (isRemote()) connectLive(); }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 30000);
}

let notifyTimer = null;
function schedulePullNotify(delay = 250) {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => { if (pending === 0) pull({ notify: true }).catch(() => {}); else schedulePullNotify(400); }, delay);
}

/* ---------- lifecycle ---------- */

export async function initRemote() {
  if (started) return;
  started = true;
  onStoreAction((type, payload) => { if (isRemote()) enqueue(type, payload); });
  api.onUnauthorized(() => endSession(true));
  await api.detect();
  if (isRemote()) {
    connectLive();
    try { await pull(); } catch (e) { if (!(e instanceof ApiError) || e.status !== 401) console.error('initial sync failed', e); }
  } else if (api.online && store.get().user && !api.token) {
    // Signed in locally from an earlier offline session, but a backend is available now: keep working locally.
  }
  const tick = () => { if (document.visibilityState === 'visible' && isRemote() && pending === 0) pull({ notify: true }).catch(() => {}); };
  clearInterval(pollTimer);
  pollTimer = setInterval(tick, POLL_MS);
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', tick);
}

// Sign-in through the API. Returns the server user; throws ApiError (message is user-ready).
export async function remoteLogin({ phone, password, role }) {
  const { token, user } = await api.post('api/auth/login', { phone, password, role }, { auth: false });
  api.setToken(token);
  store.clearUserData();
  store.login(user);
  await pull();
  connectLive();
  return user;
}

export async function remoteRegister(fields) {
  const { token, user } = await api.post('api/auth/register', fields, { auth: false });
  api.setToken(token);
  store.clearUserData();
  store.login(user);
  await pull();
  connectLive();
  return user;
}

// Sign-out (or session expiry). Best-effort revoke on the server, then wipe local copies of server data.
export async function endSession(expired = false) {
  const hadToken = !!api.token;
  disconnectLive();
  if (hadToken && !expired) { try { await api.post('api/auth/logout'); } catch { /* already gone */ } }
  api.setToken(null);
  if (hadToken) store.clearUserData(); else store.logout();
  if (expired) {
    toast('Your session expired. Please sign in again.', { tone: 'error' });
    location.hash = '#/login';
  }
}

export async function fetchNotifications() {
  return api.get('api/notifications');
}
export async function markNotificationsRead() {
  await api.post('api/notifications/read', {});
  store.set({ remote: { ...store.get().remote, unread: 0 } });
}
