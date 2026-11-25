import test from 'node:test';
import assert from 'node:assert/strict';
import { USERS } from './helpers/env.js';

// Dynamic imports so the stubs in env.js exist before the app's modules evaluate.
const D = await import('../js/data.js');
const { store } = await import('../js/store.js');
const { ROUTES, renderDynamic } = await import('../js/pages.js');
const { canAccess } = await import('../js/logic.js');

const LANGS = ['English', 'हिंदी', 'मराठी'];
const DYNAMIC_PATHS = ['/lots/LOT-1042', '/lots/LOT-1038', '/lots/LOT-1021', '/lots/NOPE', '/market/tomato', '/market/wheat', '/market/nope'];

// Things that must never appear in rendered output: they mean a value was missing or a
// template stringified an object.
const LEAKS = [/\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /\bnull\b(?![^<]*>)/];

function leakIn(html) {
  // Ignore leaks inside <script>/<style> and inside attribute-free text only; strip tags' attrs.
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  for (const re of LEAKS) {
    const m = text.match(re);
    if (m) {
      const i = text.indexOf(m[0]);
      return `${re} near: …${text.slice(Math.max(0, i - 60), i + 60).replace(/\s+/g, ' ')}…`;
    }
  }
  return null;
}

function allPathsFor(role) {
  return [...Object.keys(ROUTES).filter((p) => p !== '/login'), ...DYNAMIC_PATHS].filter((p) => canAccess(role, p));
}

for (const role of Object.keys(USERS)) {
  for (const lang of LANGS) {
    test(`every ${role} page renders cleanly in ${lang}`, () => {
      store.set({ language: lang });
      store.login(USERS[role]);
      const failures = [];
      for (const path of allPathsFor(role)) {
        let result;
        try {
          result = ROUTES[path] ? ROUTES[path]() : renderDynamic(path);
        } catch (e) {
          failures.push(`${path} threw: ${e.message}`);
          continue;
        }
        if (!result) { if (!path.endsWith('NOPE') && !path.endsWith('nope')) failures.push(`${path} rendered nothing`); continue; }
        if (typeof result.html !== 'string' || result.html.length < 40) { failures.push(`${path} produced no html`); continue; }
        const leak = leakIn(result.html);
        if (leak) failures.push(`${path}: ${leak}`);
        if (result.mount !== undefined && typeof result.mount !== 'function') failures.push(`${path}: mount is not a function`);
      }
      assert.deepEqual(failures, []);
    });
  }
}

test('the login page renders signed out', () => {
  store.logout();
  const r = ROUTES['/login']();
  assert.ok(r.html.includes('Kisan Mitra'));
  assert.equal(leakIn(r.html), null);
});

test('an unknown lot or commodity degrades to a friendly page, not an exception', () => {
  store.set({ language: 'English' });
  store.login(USERS.farmer);
  const lot = renderDynamic('/lots/NOPE');
  assert.ok(/not found/i.test(lot.html));
  assert.doesNotThrow(() => renderDynamic('/market/nope'));
});

test('role access: farmers cannot open buyer pages and vice versa', () => {
  assert.equal(canAccess('farmer', '/browse'), false);
  assert.equal(canAccess('buyer', '/lots'), false);
  assert.equal(canAccess('buyer', '/orders'), false);
  assert.equal(canAccess('fpo_operator', '/lots/LOT-1'), false, 'sub-paths inherit the restriction');
  assert.equal(canAccess('farmer', '/lots/LOT-1042'), true);
  assert.equal(canAccess('fpo_operator', '/fpo-members'), true);
  assert.equal(canAccess('farmer', '/fpo-members'), false);
  assert.equal(canAccess('buyer', '/market'), true, 'unlisted paths are shared');
});

test('every bottom/more nav link points at a real, permitted route', () => {
  const sets = {
    farmer: [...D.FARMER_BOTTOM_NAV, ...D.FARMER_MORE_NAV],
    buyer: [...D.BUYER_BOTTOM_NAV, ...D.BUYER_MORE_NAV],
    fpo_operator: [...D.FPO_OPERATOR_BOTTOM_NAV, ...D.FPO_OPERATOR_MORE_NAV],
  };
  for (const [role, items] of Object.entries(sets)) {
    for (const n of items) {
      const path = n.path.replace(/^#/, '');
      assert.ok(ROUTES[path], `${role}: nav item "${n.label}" → ${path} has no route`);
      assert.ok(canAccess(role, path), `${role}: nav item "${n.label}" → ${path} is not permitted for the role`);
    }
  }
});

/* ---------- untrusted input must never become markup ---------- */

const PAYLOAD = '<img src=x onerror=alert(1)>';

// A raw copy of the payload in the output means some template interpolated it unescaped.
function hostileUser(role) {
  const u = { ...USERS[role], name: PAYLOAD, fullName: PAYLOAD, location: PAYLOAD, phone: '9' + PAYLOAD };
  if (role === 'buyer') u.company = PAYLOAD;
  if (role === 'fpo_operator') u.fpo = PAYLOAD;
  if (role === 'farmer') u.fpo = PAYLOAD;
  return u;
}

for (const role of Object.keys(USERS)) {
  test(`${role}: markup in profile fields, chat history and grievances is escaped on every page`, () => {
    store.set({ language: 'English' });
    store.login(hostileUser(role));
    store.set({
      chat: [{ role: 'user', text: PAYLOAD }, { role: 'bot', text: PAYLOAD }],
      lots: [{ id: 'LOT-X', crop: 'Tomato', quantity: 5, unit: 'Quintals', grade: 'Grade A', harvestDate: PAYLOAD, location: PAYLOAD, askingPrice: 1500, status: 'Open', farmer: PAYLOAD }],
    });
    store.addGrievance({ id: 'GR-T', ownerPhone: '9876543210', type: 'Other', description: PAYLOAD, ref: PAYLOAD, status: 'Submitted', createdAt: new Date().toISOString(), history: [] });
    const offenders = [];
    for (const path of allPathsFor(role)) {
      const result = ROUTES[path] ? ROUTES[path]() : renderDynamic(path);
      if (result && result.html.includes(PAYLOAD)) offenders.push(path);
    }
    assert.deepEqual(offenders, []);
    store.resetAll();
  });
}
