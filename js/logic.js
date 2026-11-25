// Pure decision logic for Kisan Mitra — no DOM, no storage, no network.
// Keeping this separate from the views means every recommendation can be unit-tested
// (see tests/) and explained: each function returns the reasons alongside the answer.

import * as D from './data.js';
import { clamp } from './util.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------------- access control ---------------- */

// A path listed in ROLE_RESTRICTED_PATHS is only visible to the roles named there (sub-paths
// inherit it); anything not listed is shared by every logged-in role.
export function canAccess(role, path) {
  const hit = Object.entries(D.ROLE_RESTRICTED_PATHS).find(([p]) => path === p || path.startsWith(p + '/'));
  return !hit || hit[1].includes(role);
}

/* ---------------- sell options (net realisation) ---------------- */

export function computeNet(o) {
  return o.basePrice - o.transport - o.commission - o.storage;
}

// Rank options by what the farmer actually keeps. Ties break toward verified buyers, then
// higher reliability, so a risky trader never "wins" a tie. Returns a new array.
export function rankOptions(options) {
  const ranked = options.map((o) => ({ ...o, net: computeNet(o) }));
  ranked.sort((a, b) => (b.net - a.net) || (Number(b.verified) - Number(a.verified)) || (b.reliability - a.reliability));
  ranked.forEach((o, i) => { o.best = i === 0; });
  return ranked;
}

// Builds a plausible set of sell options for any lot from mandi prices + buyers that accept
// the lot's grade (quality-to-buyer matching: exporters want Premium only, processors take A/B).
export function generateOptions(lot) {
  const commodity = D.COMMODITIES.find((c) => c.name.toLowerCase() === String(lot.crop).toLowerCase());
  if (!commodity) return [];
  const buyers = D.BUYERS.filter((b) => b.crops.includes(lot.crop) && (!b.preferredGrades || b.preferredGrades.includes(lot.grade)));
  const opts = [];
  commodity.mandis.forEach((m, i) => {
    const km = parseInt(m.distance, 10) || 10;
    opts.push({
      id: `mandi-${i}`, label: m.name, buyer: 'Open Mandi Auction', buyerId: null,
      basePrice: m.price, transport: Math.round(km * 2.6), commission: Math.round(m.price * 0.05), storage: 0,
      distance: m.distance, pickup: 'Pickup in 2 days', verified: true, reliability: 4.0,
      reasons: ['Standard mandi auction pricing'],
    });
  });
  buyers.forEach((b) => {
    const km = parseInt(b.distance, 10) || 8;
    const gradeBonus = lot.grade === 'Premium Quality' && b.preferredGrades?.[0] === 'Premium Quality' ? 60 : 0;
    const reasons = [];
    if (b.preferredGrades) reasons.push(`Matches this buyer's ${b.preferredGrades.join('/')} requirement for ${String(lot.crop).toLowerCase()}`);
    reasons.push(b.verified ? 'Verified buyer with strong reliability score' : 'Buyer reliability not verified — payment risk');
    opts.push({
      id: `buyer-${b.id}`, label: b.name, buyer: b.name, buyerId: b.id,
      basePrice: commodity.mandis[0].price + (b.reliability >= 4.7 ? 40 : -20) + gradeBonus,
      transport: Math.round(km * 2.2), commission: b.verified ? 30 : 0, storage: 0,
      distance: b.distance, pickup: b.payment, verified: b.verified, reliability: b.reliability,
      reasons,
    });
  });
  return rankOptions(opts);
}

export function getOptions(lot) {
  return D.LOT_OPTIONS[lot.id] || generateOptions(lot);
}

/* ---------------- sell or hold ---------------- */

export const PERISHABLE_CROPS = ['Tomato', 'Onion'];

function pctChange(from, to) {
  return from ? ((to - from) / from) * 100 : 0;
}

// Combines price momentum, forecast direction and crop perishability.
export function sellOrHoldAnalysis(commodity, lot) {
  const trend = Array.isArray(commodity.trend) ? commodity.trend : [];
  const last = trend.length - 1;
  const change3d = last >= 3 ? pctChange(trend[last - 2], trend[last]) : 0;
  const change7d = last >= 1 ? pctChange(trend[0], trend[last]) : 0;
  const perishable = PERISHABLE_CROPS.includes(commodity.name);
  const reasons = [];
  let verdict;
  let confidence;

  if (commodity.forecast === 'falling') {
    verdict = 'SELL NOW';
    confidence = perishable ? 92 : 78;
    reasons.push(`Prices have fallen ${Math.abs(change7d).toFixed(1)}% over the last week and the trend is still downward.`);
    reasons.push(commodity.forecastNote);
    if (perishable) reasons.push('Perishable crop — waiting adds storage cost and quality-loss risk on top of falling prices.');
  } else if (commodity.forecast === 'rising') {
    if (perishable) {
      verdict = 'SELL SOON';
      confidence = 74;
      reasons.push(`Prices are up ${change3d.toFixed(1)}% in the last 3 days — a strong window to sell.`);
      reasons.push('Perishable crop — the extra price upside rarely outweighs spoilage and quality loss beyond a few more days.');
      reasons.push(commodity.bestWindow);
    } else {
      verdict = 'HOLD';
      confidence = 81;
      reasons.push(`Prices are up ${change3d.toFixed(1)}% in the last 3 days and still climbing.`);
      reasons.push(commodity.forecastNote);
      reasons.push('Low spoilage risk for this crop — safe to hold a few more days for a better price.');
    }
  } else {
    verdict = perishable ? 'SELL NOW' : 'HOLD';
    confidence = 65;
    reasons.push('Prices are stable this week — no strong signal to wait.');
    reasons.push(commodity.forecastNote);
    if (!perishable) reasons.push('Low storage cost and steady demand make holding low-risk for this crop.');
  }

  if (lot && lot.quantity) reasons.push(`Based on your lot of ${lot.quantity} ${lot.unit || 'Quintals'} — reassess if quantity or grade changes.`);
  return { verdict, confidence, change3d, change7d, reasons };
}

/* ---------------- storage economics (store vs sell now) ---------------- */

// How much of the last week's price slope we assume continues. Deliberately conservative:
// real prices can and do reverse, which the UI says plainly.
const TREND_CONTINUATION = 0.4;

// Daily quality/weight loss while stored, by crop class and facility type.
export function spoilagePctPerDay(crop, facility) {
  const perishable = PERISHABLE_CROPS.includes(crop);
  const cold = facility?.type === 'Cold Storage';
  if (perishable) return cold ? 0.6 : 1.5;
  return cold ? 0.03 : 0.08;
}

export function bestMandiPrice(commodity) {
  return commodity.mandis.reduce((max, m) => Math.max(max, m.price), 0);
}

// Net outcome of holding `quantity` quintals for `days` in `facility` (null = at the farm)
// versus selling today at the best mandi price. All money figures are per quintal unless
// the name says total.
export function storageEconomics({ commodity, quantity, days, facility = null }) {
  const qty = Math.max(0, Number(quantity) || 0);
  const d = clamp(Math.round(Number(days) || 0), 0, 90);
  const trend = commodity.trend;
  const slope = trend.length > 1 ? (trend[trend.length - 1] - trend[0]) / (trend.length - 1) : 0;
  const sellNow = bestMandiPrice(commodity);
  const projectedPrice = Math.max(0, sellNow + slope * TREND_CONTINUATION * d);
  const spoilPct = Math.min(100, spoilagePctPerDay(commodity.name, facility) * d);
  const spoilageLoss = projectedPrice * (spoilPct / 100);
  const storageCost = facility ? facility.ratePerDay * d : 0;
  const netHold = projectedPrice - spoilageLoss - storageCost;
  const gainPerQtl = netHold - sellNow;
  const unsuitable = !!facility && Array.isArray(facility.suitableFor) && !facility.suitableFor.includes(commodity.name);
  return {
    days: d, quantity: qty, sellNow, projectedPrice, spoilPct, spoilageLoss, storageCost, netHold,
    gainPerQtl, totalGain: gainPerQtl * qty, unsuitable,
    better: gainPerQtl > 0 && !unsuitable ? 'store' : 'sell',
  };
}

// Evaluate several holding periods at once and report the most profitable one.
export function compareHoldPeriods({ commodity, quantity, facility, periods = [3, 7, 14, 21] }) {
  const rows = periods.map((days) => storageEconomics({ commodity, quantity, days, facility }));
  const best = rows.reduce((b, r) => (r.gainPerQtl > b.gainPerQtl ? r : b), rows[0]);
  return { rows, best: best.gainPerQtl > 0 && !best.unsuitable ? best : null };
}

/* ---------------- FPO pooling ---------------- */

// A pool collects member quintals toward a buyer's bulk threshold. Crossing a volume tier
// unlocks a price uplift for *everyone* in the pool — the bargaining-power effect.
export function poolStatus(pool, myQty = 0) {
  const mine = Math.max(0, Number(myQty) || 0);
  const total = pool.pooledQty + mine;
  const tiers = [...pool.tiers].sort((a, b) => a.minQty - b.minQty);
  const reached = tiers.filter((t) => total >= t.minQty);
  const tier = reached.length ? reached[reached.length - 1] : null;
  const next = tiers.find((t) => total < t.minQty) || null;
  const uplift = tier ? tier.uplift : 0;
  const withoutMe = tiers.filter((t) => pool.pooledQty >= t.minQty).pop();
  const upliftWithoutMe = withoutMe ? withoutMe.uplift : 0;
  return {
    total,
    tier,
    next,
    toNext: next ? next.minQty - total : 0,
    pricePerQtl: pool.basePrice + uplift,
    uplift,
    // What joining adds over selling the same quintals at the pool's base price.
    myExtraEarnings: mine * uplift,
    // What the pool gains collectively because I joined (my quintals pushed it over a tier).
    upliftUnlockedByMe: uplift - upliftWithoutMe,
    progressPct: clamp((total / pool.targetQty) * 100, 0, 100),
    filled: total >= pool.targetQty,
  };
}

/* ---------------- shared transport ---------------- */

// A shared trip splits one vehicle's cost across every farmer's quintals on board, so the
// per-quintal cost falls as the truck fills. Compare against hiring a vehicle alone.
export function sharedTripCost(trip, myQty) {
  const mine = Math.max(0, Number(myQty) || 0);
  const totalCost = trip.ratePerKm * trip.distanceKm; // billable km already covers the return leg
  const loaded = Math.min(trip.capacityQtl, trip.bookedQtl + mine);
  const perQtl = loaded > 0 ? totalCost / loaded : totalCost;
  const myCost = perQtl * mine;
  // Alternative: hire the cheapest suitable vehicle by yourself for the same route.
  const soloVehicles = Math.max(1, Math.ceil(mine / trip.soloCapacityQtl));
  const soloCost = soloVehicles * trip.soloRatePerKm * trip.distanceKm;
  const seatsLeft = Math.max(0, trip.capacityQtl - trip.bookedQtl);
  return {
    totalCost, perQtl, myCost, soloCost,
    saving: Math.max(0, soloCost - myCost),
    seatsLeft,
    fits: mine > 0 && mine <= seatsLeft,
    fillPct: clamp(((trip.bookedQtl + mine) / trip.capacityQtl) * 100, 0, 100),
  };
}

/* ---------------- offer cancel window ---------------- */

export const CANCEL_WINDOW_MS = DAY_MS;

export function offerCancelWindow(acceptedAt, now = Date.now()) {
  if (!acceptedAt) return { canCancel: false, msLeft: 0, hours: 0, mins: 0 };
  const msLeft = acceptedAt + CANCEL_WINDOW_MS - now;
  if (msLeft <= 0) return { canCancel: false, msLeft: 0, hours: 0, mins: 0 };
  return { canCancel: true, msLeft, hours: Math.floor(msLeft / 3600000), mins: Math.floor((msLeft % 3600000) / 60000) };
}

/* ---------------- grievances ---------------- */

export const GRIEVANCE_STATUSES = ['Submitted', 'Under Review', 'Resolved'];
export const GRIEVANCE_TYPES = ['Quality dispute', 'Payment delay', 'Logistics issue', 'Buyer unreachable', 'Other'];
export const GRIEVANCE_MIN_LENGTH = 10;

// Returns an error message, or null when the form is valid.
export function validateGrievance({ type, description }) {
  if (!GRIEVANCE_TYPES.includes(type)) return 'Choose an issue type.';
  const text = String(description || '').trim();
  if (text.length < GRIEVANCE_MIN_LENGTH) return `Please describe the issue in at least ${GRIEVANCE_MIN_LENGTH} characters.`;
  if (text.length > 1000) return 'Please keep the description under 1000 characters.';
  return null;
}

export function nextGrievanceStatus(status) {
  const i = GRIEVANCE_STATUSES.indexOf(status);
  return i >= 0 && i < GRIEVANCE_STATUSES.length - 1 ? GRIEVANCE_STATUSES[i + 1] : null;
}

/* ---------------- quality pre-grading ---------------- */

// The 6 checks a camera-based preliminary pass can realistically assess from one photo.
// (Surface quality, uniformity and cleanliness need multi-angle or lab inspection.)
export const QUALITY_FACTORS = [
  { key: 'colour', label: 'Colour Compliance', icon: 'droplet', passNote: 'Uniform, deep colour typical of the variety at peak quality.', warnNote: 'Some colour variation detected — within range for most buyers, but below premium spec.' },
  { key: 'size', label: 'Size Compliance', icon: 'sliders', passNote: 'Size falls within the standard grading bracket for this crop.', warnNote: 'Noticeable size variation across the sample — may affect premium-grade pricing.' },
  { key: 'shape', label: 'Shape Compliance', icon: 'package', passNote: 'Regular, well-formed shape with no notable irregularities.', warnNote: 'Minor shape irregularities detected — cosmetic, unlikely to affect price much.' },
  { key: 'defects', label: 'Visible Defect Compliance', icon: 'alert', passNote: 'No visible cuts, bruising or blemishes detected.', warnNote: 'Minor surface blemishes detected — worth a closer manual check before listing.' },
  { key: 'maturity', label: 'Maturity / Ripeness Compliance', icon: 'clock', passNote: 'Harvested at optimal maturity for transport and shelf life.', warnNote: 'Slightly under- or over-ripe — still sellable, but sell sooner rather than hold.' },
  { key: 'disease', label: 'Disease / Pest Damage Compliance', icon: 'bug', passNote: 'No signs of disease or pest damage detected.', warnNote: 'Possible early-stage pest or disease marks detected — inspect the full lot closely.' },
];

export const PASS_THRESHOLD = 85;

// Deterministic pseudo-score from the photo's own name + size, so the same photo always
// grades the same way. A stand-in for a real vision model.
export function hashScore(str, salt) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i) + salt) % 100;
  return Math.abs(h);
}

export function gradeQualityFactors(file) {
  const base = `${file?.name ?? ''}${file?.size ?? 0}`;
  return QUALITY_FACTORS.map((f, i) => {
    const score = 70 + (hashScore(base, i * 17 + 3) % 30); // 70–99
    return { ...f, score, status: score >= PASS_THRESHOLD ? 'pass' : 'warn' };
  });
}

export function overallGradeFrom(factors) {
  if (!factors.length) return 'Grade B';
  const avg = factors.reduce((s, f) => s + f.score, 0) / factors.length;
  if (avg >= 90) return 'Premium Quality';
  if (avg >= 78) return 'Grade A';
  return 'Grade B';
}
