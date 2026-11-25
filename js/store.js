// Tiny localStorage-backed store for persistence across page loads.
import { phoneKey } from './util.js';

export const STORAGE_KEY = 'kisanmitra:state:v3';
const KEY = STORAGE_KEY;

export const ROLES = ['farmer', 'buyer', 'fpo_operator'];
export const LANGUAGES = ['English', 'हिंदी', 'मराठी'];

export function defaultState() {
  return {
    location: 'Rangareddy District, Telangana',
    startedCrop: null,
    likedPosts: [],
    postLikes: {},
    posts: [],
    chat: [],
    bookings: [],
    lotStatus: {},
    acceptedOption: {},
    offerAcceptedAt: {},
    orders: [],
    lots: [],
    language: 'English',
    voiceEnabled: true,
    fpoJoined: true,
    user: null,
    offers: [],
    accounts: [],
    grievances: [],
    poolContributions: {},
    sharedTripBookings: {},
  };
}

// Anything read back from localStorage is untrusted: it may be hand-edited, truncated, written
// by an older version or just corrupt. Keep only values whose type matches the defaults, so a
// bad value can never crash a page — it falls back to the default instead.
export function sanitizeState(raw, defaults = defaultState()) {
  const out = { ...defaults };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const key of Object.keys(defaults)) {
    if (!(key in raw)) continue;
    const dv = defaults[key];
    const rv = raw[key];
    if (Array.isArray(dv)) { if (Array.isArray(rv)) out[key] = rv; }
    else if (dv !== null && typeof dv === 'object') { if (rv && typeof rv === 'object' && !Array.isArray(rv)) out[key] = rv; }
    else if (dv === null) { if (rv === null || typeof rv === 'object') out[key] = rv; }
    else if (typeof rv === typeof dv) out[key] = rv;
  }
  if (out.user && (typeof out.user !== 'object' || Array.isArray(out.user) || !ROLES.includes(out.user.role))) out.user = null;
  if (!LANGUAGES.includes(out.language)) out.language = defaults.language;
  out.accounts = out.accounts.filter((a) => a && typeof a === 'object' && typeof a.phone === 'string');
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitizeState(JSON.parse(raw));
  } catch (e) { /* unreadable or unavailable storage — start fresh */ }
  return defaultState();
}

let state = load();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

export const store = {
  get() { return state; },
  set(patch) { state = { ...state, ...patch }; persist(); },
  toggleLike(postId, baseLikes) {
    const liked = state.likedPosts.includes(postId);
    const likedPosts = liked ? state.likedPosts.filter((id) => id !== postId) : [...state.likedPosts, postId];
    const current = state.postLikes[postId] ?? baseLikes;
    const postLikes = { ...state.postLikes, [postId]: liked ? current - 1 : current + 1 };
    state = { ...state, likedPosts, postLikes };
    persist();
    return { liked: !liked, likes: postLikes[postId] };
  },
  isLiked(postId) { return state.likedPosts.includes(postId); },
  getLikes(postId, baseLikes) { return state.postLikes[postId] ?? baseLikes; },
  addPost(post) { state = { ...state, posts: [post, ...state.posts] }; persist(); },
  addChat(msg) { state = { ...state, chat: [...state.chat, msg] }; persist(); },
  clearChat() { state = { ...state, chat: [] }; persist(); },
  addBooking(b) { state = { ...state, bookings: [...state.bookings, b] }; persist(); },
  getLotStatus(id, fallback) { return state.lotStatus[id] ?? fallback; },
  setLotStatus(id, status) { state = { ...state, lotStatus: { ...state.lotStatus, [id]: status } }; persist(); },
  acceptOption(lotId, optionId) {
    state = {
      ...state,
      acceptedOption: { ...state.acceptedOption, [lotId]: optionId },
      offerAcceptedAt: { ...state.offerAcceptedAt, [lotId]: Date.now() },
    };
    persist();
  },
  getAcceptedOption(lotId) { return state.acceptedOption[lotId]; },
  getOfferAcceptedAt(lotId) { return state.offerAcceptedAt[lotId]; },
  // Farmers can back out of an accepted offer within a 24-hour cooling-off window, before
  // the buyer has arranged pickup — undoes the acceptance and removes the resulting order.
  cancelOffer(lotId, revertStatus) {
    const { [lotId]: _drop1, ...acceptedOption } = state.acceptedOption;
    const { [lotId]: _drop2, ...offerAcceptedAt } = state.offerAcceptedAt;
    state = {
      ...state,
      acceptedOption,
      offerAcceptedAt,
      lotStatus: { ...state.lotStatus, [lotId]: revertStatus || 'Recommendation Ready' },
      orders: state.orders.filter((o) => o.lotId !== lotId),
    };
    persist();
  },
  addOrder(order) { state = { ...state, orders: [order, ...state.orders] }; persist(); },
  updateOrderStage(id, stage) {
    state = { ...state, orders: state.orders.map((o) => (o.id === id ? { ...o, stage } : o)) };
    persist();
  },
  setLanguage(lang) { state = { ...state, language: lang }; persist(); },
  login(user) { state = { ...state, user }; persist(); },
  logout() { state = { ...state, user: null }; persist(); },
  updateUser(patch) { if (!state.user) return; state = { ...state, user: { ...state.user, ...patch } }; persist(); },
  findAccount(phone) {
    const key = phoneKey(phone);
    if (!key) return undefined;
    return state.accounts.find((a) => phoneKey(a.phone) === key);
  },
  createAccount(account) {
    state = { ...state, accounts: [...state.accounts, account] };
    persist();
  },
  updateAccount(phone, patch) {
    const key = phoneKey(phone);
    state = { ...state, accounts: state.accounts.map((a) => (phoneKey(a.phone) === key ? { ...a, ...patch } : a)) };
    persist();
  },
  // Wipe everything and start over — the escape hatch if saved data is ever broken.
  resetAll() {
    state = defaultState();
    try { localStorage.removeItem(KEY); } catch (e) {}
  },

  // --- grievances ---
  addGrievance(g) { state = { ...state, grievances: [g, ...state.grievances] }; persist(); },
  updateGrievance(id, patch) {
    state = { ...state, grievances: state.grievances.map((g) => (g.id === id ? { ...g, ...patch } : g)) };
    persist();
  },

  // --- FPO pools: quintals the farmer has committed to each open pool ---
  setPoolContribution(poolId, qty) {
    state = { ...state, poolContributions: { ...state.poolContributions, [poolId]: qty } };
    persist();
  },
  clearPoolContribution(poolId) {
    const { [poolId]: _removed, ...rest } = state.poolContributions;
    state = { ...state, poolContributions: rest };
    persist();
  },

  // --- shared transport: quintals booked on each shared trip ---
  setSharedTripBooking(tripId, booking) {
    state = { ...state, sharedTripBookings: { ...state.sharedTripBookings, [tripId]: booking } };
    persist();
  },
  clearSharedTripBooking(tripId) {
    const { [tripId]: _removed, ...rest } = state.sharedTripBookings;
    state = { ...state, sharedTripBookings: rest };
    persist();
  },

  addOffer(offer) { state = { ...state, offers: [offer, ...state.offers] }; persist(); },
  updateOfferStatus(id, status) {
    state = { ...state, offers: state.offers.map((o) => (o.id === id ? { ...o, status } : o)) };
    persist();
  },
};
