import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './helpers/env.js';

const D = await import('../js/data.js');
const { DICT, t } = await import('../js/i18n.js');
const { store } = await import('../js/store.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const jsFiles = () => fs.readdirSync(path.join(root, 'js'), { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.js')).map((e) => `js/${e.name}`);

const CROPS = D.COMMODITIES.map((c) => c.name);
const KYC_STATES = ['verified', 'pending', 'not_verified', 'not_applicable'];

/* ---------- market data ---------- */

test('commodities: unique ids, 7-day trend matching the labels, positive prices', () => {
  assert.equal(new Set(D.COMMODITIES.map((c) => c.id)).size, D.COMMODITIES.length);
  for (const c of D.COMMODITIES) {
    assert.equal(c.trend.length, 7, c.name);
    assert.equal(c.days.length, c.trend.length, c.name);
    assert.ok(c.trend.every((v) => v > 0), c.name);
    assert.ok(['rising', 'falling', 'stable'].includes(c.forecast), c.name);
    assert.ok(c.mandis.length > 0 && c.mandis.every((m) => m.price > 0), c.name);
    assert.ok(c.forecastNote && c.bestWindow, c.name);
  }
});

test("each commodity's declared forecast agrees with its own price trend", () => {
  for (const c of D.COMMODITIES) {
    const change = ((c.trend.at(-1) - c.trend[0]) / c.trend[0]) * 100;
    if (c.forecast === 'rising') assert.ok(change > 0, `${c.name} says rising but moved ${change.toFixed(1)}%`);
    if (c.forecast === 'falling') assert.ok(change < 0, `${c.name} says falling but moved ${change.toFixed(1)}%`);
    if (c.forecast === 'stable') assert.ok(Math.abs(change) < 3, `${c.name} says stable but moved ${change.toFixed(1)}%`);
  }
});

test('every crop that appears anywhere is a known commodity', () => {
  const seen = [
    ...D.LOTS.map((l) => l.crop), ...D.AVAILABLE_LOTS.map((l) => l.crop), ...D.ORDERS.map((o) => o.crop),
    ...D.BUYERS.flatMap((b) => b.crops), ...D.FPO_MEMBER_LOTS.map((m) => m.crop), ...D.POOLS.map((p) => p.crop),
    ...D.STORAGE_FACILITIES.flatMap((s) => s.suitableFor),
    ...Object.values(D.CROP_PLAN).flat().map((c) => c.name),
  ];
  for (const crop of seen) assert.ok(CROPS.includes(crop), `unknown crop "${crop}"`);
});

/* ---------- buyers & verification ---------- */

test('buyers: ids unique, every KYC field uses a valid state, scores are 0–100', () => {
  assert.equal(new Set(D.BUYERS.map((b) => b.id)).size, D.BUYERS.length);
  for (const b of D.BUYERS) {
    for (const k of ['businessKyc', 'gstin', 'pan', 'fssai', 'bankAccount', 'address', 'capacity']) {
      assert.ok(KYC_STATES.includes(b.kyc[k]), `${b.name}.${k} = ${b.kyc[k]}`);
    }
    assert.ok(b.kyc.paymentScore >= 0 && b.kyc.paymentScore <= 100, b.name);
    assert.ok(b.kyc.fulfilmentRate >= 0 && b.kyc.fulfilmentRate <= 100, b.name);
    assert.ok(b.kyc.disputesResolved <= b.kyc.disputes, `${b.name}: more disputes resolved than raised`);
    assert.ok(b.reliability >= 0 && b.reliability <= 5, b.name);
  }
});

test('a "verified" buyer really has its core credentials verified; an unverified one does not', () => {
  const core = ['businessKyc', 'gstin', 'pan', 'bankAccount', 'address', 'capacity'];
  for (const b of D.BUYERS) {
    const allOk = core.every((k) => b.kyc[k] === 'verified');
    assert.equal(allOk, b.verified, `${b.name}: verified flag disagrees with its KYC checklist`);
    if (b.kyc.gstin === 'verified') assert.ok(b.kyc.gstinNumber, `${b.name} has no GSTIN number`);
    if (b.kyc.pan === 'verified') assert.ok(b.kyc.panNumber, `${b.name} has no PAN number`);
  }
});

test('GSTIN and PAN numbers are well-formed', () => {
  for (const b of D.BUYERS) {
    if (b.kyc.panNumber) assert.match(b.kyc.panNumber, /^[A-Z]{5}[0-9]{4}[A-Z]$/, b.name);
    if (b.kyc.gstinNumber) assert.match(b.kyc.gstinNumber, /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, b.name);
  }
});

test('FSSAI is required only where food is handled (cotton mill: not applicable)', () => {
  const cotton = D.BUYERS.find((b) => b.name === 'Maharashtra Cotton Mills');
  assert.equal(cotton.kyc.fssai, 'not_applicable');
  for (const b of D.BUYERS.filter((x) => x.crops.some((c) => c !== 'Cotton') && x.verified)) {
    assert.equal(b.kyc.fssai, 'verified', b.name);
  }
});

/* ---------- options, orders, logistics ---------- */

test('hand-tuned lot options: net = base − costs, one best, best has the top net', () => {
  for (const [lotId, opts] of Object.entries(D.LOT_OPTIONS)) {
    for (const o of opts) assert.equal(o.net, o.basePrice - o.transport - o.commission - o.storage, `${lotId}/${o.id}`);
    assert.equal(opts.filter((o) => o.best).length, 1, lotId);
    assert.equal(opts.find((o) => o.best).net, Math.max(...opts.map((o) => o.net)), lotId);
  }
});

test('orders: stage index valid and amount = rate × quantity', () => {
  assert.equal(D.ORDER_STAGES.length, 5);
  assert.equal(new Set(D.ORDERS.map((o) => o.id)).size, D.ORDERS.length);
  for (const o of D.ORDERS) {
    assert.ok(Number.isInteger(o.stage) && o.stage >= 0 && o.stage < D.ORDER_STAGES.length, o.id);
    assert.equal(o.amount, o.rate * o.quantity, o.id);
  }
});

test('seed bids reference real buyers and real lots', () => {
  const lotIds = new Set(D.LOTS.map((l) => l.id));
  const buyerIds = new Set(D.BUYERS.map((b) => b.id));
  for (const [lotId, bids] of Object.entries(D.SEED_BIDS)) {
    assert.ok(lotIds.has(lotId), `SEED_BIDS references missing lot ${lotId}`);
    for (const bid of bids) if (bid.buyerId) assert.ok(buyerIds.has(bid.buyerId), `${lotId}: unknown buyer ${bid.buyerId}`);
  }
});

test('transport and storage coordinates are in the Nashik region; rates are positive', () => {
  for (const x of [...D.TRANSPORT_PROVIDERS, ...D.STORAGE_FACILITIES]) {
    assert.ok(x.lat > 19.5 && x.lat < 20.5 && x.lon > 73.4 && x.lon < 74.2, `${x.name} lat/lon`);
  }
  assert.ok(D.TRANSPORT_PROVIDERS.every((p) => p.ratePerKm > 0));
  assert.ok(D.STORAGE_FACILITIES.every((s) => s.ratePerDay > 0 && s.suitableFor.length > 0));
});

test('shared trips: real providers, seats available, solo comparison sane', () => {
  const providers = new Set(D.TRANSPORT_PROVIDERS.map((p) => p.id));
  for (const s of D.SHARED_TRIPS) {
    assert.ok(providers.has(s.providerId), s.id);
    assert.ok(s.bookedQtl >= 0 && s.bookedQtl < s.capacityQtl, `${s.id} has no seats left`);
    assert.ok(s.soloCapacityQtl > 0 && s.soloRatePerKm > 0 && s.ratePerKm > 0 && s.distanceKm > 0, s.id);
  }
});

test('pools: buyer exists, accepts the crop and grade, tiers ascend to the target', () => {
  for (const p of D.POOLS) {
    const buyer = D.BUYERS.find((b) => b.id === p.buyerId);
    assert.ok(buyer, `${p.id}: unknown buyer`);
    assert.ok(buyer.crops.includes(p.crop), `${p.id}: ${buyer.name} does not buy ${p.crop}`);
    if (buyer.preferredGrades) assert.ok(buyer.preferredGrades.includes(p.grade), `${p.id}: ${buyer.name} does not accept ${p.grade}`);
    assert.ok(p.pooledQty > 0 && p.pooledQty < p.targetQty, p.id);
    const mins = p.tiers.map((x) => x.minQty);
    assert.deepEqual(mins, [...mins].sort((a, b) => a - b), `${p.id} tiers not ascending`);
    assert.equal(p.tiers.at(-1).minQty, p.targetQty, `${p.id}: top tier should equal the target`);
    assert.ok(p.tiers.every((x, i) => i === 0 || x.uplift > p.tiers[i - 1].uplift), `${p.id}: uplift must grow with volume`);
  }
});

/* ---------- crop planning ---------- */

test('crop plan: every season has crops, every crop has a style, soils are known', () => {
  const soils = new Set([...Object.values(D.SOIL_BY_STATE).map((s) => s.type), D.DEFAULT_SOIL.type]);
  assert.deepEqual(Object.keys(D.CROP_PLAN).sort(), Object.keys(D.CROP_SEASONS).sort());
  for (const [season, crops] of Object.entries(D.CROP_PLAN)) {
    assert.ok(crops.length > 0, season);
    for (const c of crops) {
      assert.ok(D.CROP_STYLE[c.name], `${season}: no style for ${c.name}`);
      for (const s of c.soils) assert.ok(soils.has(s), `${season}/${c.name}: unknown soil "${s}"`);
    }
  }
});

test('seasons: every month maps to a season, and next-season cycles Kharif → Rabi → Zaid → Kharif', () => {
  const expected = { 1: 'Rabi', 2: 'Zaid', 3: 'Zaid', 4: 'Zaid', 5: 'Zaid', 6: 'Kharif', 7: 'Kharif', 8: 'Kharif', 9: 'Kharif', 10: 'Rabi', 11: 'Rabi', 12: 'Rabi' };
  for (const [m, season] of Object.entries(expected)) assert.equal(D.currentCropSeason(new Date(2026, m - 1, 15)), season, `month ${m}`);
  assert.equal(D.CROP_SEASONS.Kharif.next, 'Rabi');
  assert.equal(D.CROP_SEASONS.Rabi.next, 'Zaid');
  assert.equal(D.CROP_SEASONS.Zaid.next, 'Kharif');
});

test('soilForLocation maps known states and falls back to loamy', () => {
  assert.equal(D.soilForLocation('Nashik, Maharashtra').type, 'Black (Regur) Soil');
  assert.equal(D.soilForLocation('Ludhiana, Punjab').type, 'Alluvial Soil');
  assert.equal(D.soilForLocation('Somewhere, Atlantis').type, 'Loamy Soil');
  assert.equal(D.soilForLocation('').type, 'Loamy Soil');
  assert.equal(D.soilForLocation(undefined).type, 'Loamy Soil');
});

/* ---------- translations ---------- */

test('every dictionary entry has a non-empty Hindi and Marathi translation', () => {
  const missing = [];
  for (const [key, v] of Object.entries(DICT)) {
    if (!key.trim()) missing.push('(empty key)');
    if (!v.hi || !v.hi.trim()) missing.push(`hi: ${key}`);
    if (!v.mr || !v.mr.trim()) missing.push(`mr: ${key}`);
  }
  assert.deepEqual(missing, []);
});

test('placeholders such as {n} are preserved in translations', () => {
  for (const [key, v] of Object.entries(DICT)) {
    const tokens = key.match(/\{[a-zA-Z]+\}/g) || [];
    for (const tok of tokens) {
      assert.ok(v.hi.includes(tok), `hi lost ${tok} in: ${key}`);
      assert.ok(v.mr.includes(tok), `mr lost ${tok} in: ${key}`);
    }
  }
});

test('t() translates known keys and falls back to English for unknown ones', () => {
  store.set({ language: 'हिंदी' });
  assert.equal(t('Home'), DICT.Home.hi);
  assert.equal(t('A string that is not in the dictionary'), 'A string that is not in the dictionary');
  store.set({ language: 'English' });
  assert.equal(t('Home'), 'Home');
  assert.equal(t(''), '');
});

/* ---------- assets & PWA files ---------- */

function collectAssetRefs() {
  const files = ['index.html', 'css/style.css', 'sw.js', 'manifest.json', ...jsFiles()];
  const refs = new Set();
  for (const f of files) {
    for (const m of read(f).matchAll(/(?:\.\/|\.\.\/|\/)?(assets\/[A-Za-z0-9_\-./]+\.(?:png|jpe?g|avif|webp|svg|ico))/g)) refs.add(m[1]);
  }
  return [...refs];
}

test('every image the app references exists on disk', () => {
  const missing = collectAssetRefs().filter((r) => !exists(r));
  assert.deepEqual(missing, []);
});

test('navigation icon files named in icons.js all exist', () => {
  const names = [...read('js/icons.js').matchAll(/['"]([a-z-]+\.png)['"]/g)].map((m) => m[1]);
  assert.ok(names.length >= 8, 'expected NAV_IMAGES entries');
  for (const n of names) assert.ok(exists(`assets/nav-icons/${n}`), n);
});

test('PWA: manifest icons and service-worker shell files exist and use relative URLs', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.ok(manifest.name && manifest.short_name);
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith('./'), `manifest icon ${icon.src} must be relative for sub-path hosting`);
    assert.ok(exists(icon.src.replace(/^\.\//, '')), icon.src);
  }
  assert.ok(manifest.start_url.startsWith('.'));
  const shell = read('sw.js').match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
  const urls = [...shell.matchAll(/'(\.[^']*)'/g)].map((m) => m[1]);
  assert.ok(urls.length > 10);
  for (const u of urls) assert.ok(u === './' || exists(u.replace(/^\.\//, '')), `service worker precaches missing file ${u}`);
});

test('no absolute /assets, /js or /css URLs (they break on GitHub Pages sub-paths)', () => {
  const offenders = [];
  for (const f of ['index.html', 'css/style.css', 'manifest.json', ...jsFiles()]) {
    for (const m of read(f).matchAll(/["'`(]\/(assets|js|css|api)\//g)) offenders.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(offenders, []);
});

test('index.html loads only files that exist', () => {
  const html = read('index.html');
  for (const m of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) assert.ok(exists(m[1]), m[1]);
});

test('no secrets: the repo must not contain an API key', () => {
  for (const f of [...jsFiles(), 'devserver.py', 'index.html', 'sw.js']) {
    assert.doesNotMatch(read(f), /579b464db66ec23bd/, `${f} contains the old data.gov.in key`);
    assert.doesNotMatch(read(f), /api-key=[0-9a-f]{20,}/i, f);
  }
});
