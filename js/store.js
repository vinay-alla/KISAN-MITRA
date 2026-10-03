// Tiny localStorage-backed store for "real feel" persistence across the clone.
const KEY = 'kisanmitra:state:v3';

function load() {
  const defaults = {
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
    fpoJoined: true,
    user: null,
    offers: [],
    accounts: [],
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch (e) {}
  return defaults;
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
    const key = String(phone || '').replace(/\D/g, '');
    return state.accounts.find((a) => a.phone.replace(/\D/g, '') === key);
  },
  createAccount(account) {
    state = { ...state, accounts: [...state.accounts, account] };
    persist();
  },
  updateAccount(phone, patch) {
    const key = String(phone || '').replace(/\D/g, '');
    state = { ...state, accounts: state.accounts.map((a) => (a.phone.replace(/\D/g, '') === key ? { ...a, ...patch } : a)) };
    persist();
  },
  addOffer(offer) { state = { ...state, offers: [offer, ...state.offers] }; persist(); },
  updateOfferStatus(id, status) {
    state = { ...state, offers: state.offers.map((o) => (o.id === id ? { ...o, status } : o)) };
    persist();
  },
};
