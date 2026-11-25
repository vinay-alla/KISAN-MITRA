// Thin client for the Kisan Mitra REST API (server/ — see docs/API.md).
//
// The app is local-first: when no backend answers (e.g. on GitHub Pages) everything keeps
// working against localStorage. detect() decides which mode we're in at start-up.

const TOKEN_KEY = 'kisanmitra:token';
const BASE_KEY = 'kisanmitra:apiBase';   // optional: backend on another origin (needs KM_CORS_ORIGIN there)

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const mode = { online: false, demoMode: false, liveMandi: false, ai: false };
let onUnauthorized = null;

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, value) { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage blocked */ } }

const base = () => (safeGet(BASE_KEY) || '').replace(/\/+$/, '');
// Relative on purpose: works at a domain root and behind a reverse proxy under a sub-path.
const url = (path) => (base() ? `${base()}/${path}` : `./${path}`);

export const api = {
  get online() { return mode.online; },
  get demoMode() { return mode.demoMode; },
  get liveMandi() { return mode.liveMandi; },
  get ai() { return mode.ai; },
  get token() { return safeGet(TOKEN_KEY); },
  setToken(token) { safeSet(TOKEN_KEY, token || null); },
  onUnauthorized(fn) { onUnauthorized = fn; },

  // Is there a Kisan Mitra backend here? A static host answers /api/health with a 404 page or
  // an HTML fallback, neither of which parses as our JSON, so that counts as "offline".
  async detect(timeoutMs = 1500) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url('api/health'),{ signal: ctl?.signal, cache: 'no-store' });
      const body = res.ok ? await res.json() : null;
      mode.online = !!body && body.status === 'ok';
      mode.demoMode = !!body?.demoMode;
      mode.liveMandi = !!body?.liveMandi;
      mode.ai = !!body?.ai;
    } catch {
      mode.online = false;
    } finally {
      if (timer) clearTimeout(timer);
    }
    return mode.online;
  },

  async request(method, path, body, { auth = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = this.token;
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(url(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'network', 'Could not reach the server. Check your connection.');
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty or non-JSON body */ }
    if (!res.ok) {
      const e = data?.error || {};
      const err = new ApiError(res.status, e.code || 'error', e.message || `Request failed (${res.status}).`, e.details);
      if (auth && res.status === 401 && ['invalid_token', 'unauthenticated'].includes(err.code) && onUnauthorized) onUnauthorized(err);
      throw err;
    }
    return data;
  },

  get(path, opts) { return this.request('GET', path, undefined, opts); },
  post(path, body = {}, opts) { return this.request('POST', path, body, opts); },
  put(path, body = {}, opts) { return this.request('PUT', path, body, opts); },
  patch(path, body = {}, opts) { return this.request('PATCH', path, body, opts); },
  del(path, body, opts) { return this.request('DELETE', path, body, opts); },
};
