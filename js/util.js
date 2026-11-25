// Small, dependency-free helpers shared by the views and the logic layer.
// Nothing here touches the DOM or storage, so it can be unit-tested in Node.

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escape untrusted text (user input, third-party API data) before it goes into an HTML
// template string. Templates here build innerHTML, so every non-literal value that a user
// or a remote service can influence must pass through this.
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

export function inr(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '₹—';
  return '₹' + Math.round(v).toLocaleString('en-IN');
}

// Like inr() but keeps paise when there are any (₹1.5, ₹5.5) — rates such as storage per
// quintal per day must not be rounded to whole rupees.
export function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '₹—';
  return '₹' + Number(v.toFixed(2)).toLocaleString('en-IN');
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.map((p) => Array.from(p)[0]).slice(0, 2).join('').toUpperCase();
}

// Great-circle distance in km between two lat/lon points.
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function fmtKm(km) {
  if (!Number.isFinite(km)) return '—';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// "Nashik, Maharashtra" -> "Maharashtra". Falls back to Maharashtra when there is no usable text.
export function stateFromLocation(loc) {
  const parts = String(loc || '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'Maharashtra';
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// Parse a user-typed number; returns `fallback` for blank / non-numeric / non-finite input.
export function toNumber(value, fallback = 0) {
  const text = String(value ?? '').replace(/,/g, '').trim();
  if (text === '') return fallback;
  const n = Number(text);
  return Number.isFinite(n) ? n : fallback;
}

// Canonical key for an Indian mobile number: digits only, last 10 (drops +91 / 0 prefixes), so
// "+91 98765 43210", "098765-43210" and "9876543210" all identify the same account.
export function phoneKey(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// A valid Indian mobile number: 10 digits (after dropping +91 / 0), starting 6–9.
export function isValidIndianMobile(phone) {
  return /^[6-9]\d{9}$/.test(phoneKey(phone));
}
