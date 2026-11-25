import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/data.js';
import {
  computeNet, rankOptions, generateOptions, getOptions,
  sellOrHoldAnalysis, spoilagePctPerDay, storageEconomics, compareHoldPeriods,
  poolStatus, sharedTripCost, offerCancelWindow, CANCEL_WINDOW_MS,
  validateGrievance, nextGrievanceStatus, GRIEVANCE_STATUSES,
  gradeQualityFactors, overallGradeFrom, QUALITY_FACTORS, hashScore,
} from '../js/logic.js';

const commodity = (name) => D.COMMODITIES.find((c) => c.name === name);
const facility = (id) => D.STORAGE_FACILITIES.find((f) => f.id === id);

/* ---------- net realisation ---------- */

test('computeNet = base − transport − commission − storage', () => {
  assert.equal(computeNet({ basePrice: 1650, transport: 80, commission: 50, storage: 0 }), 1520);
  assert.equal(computeNet({ basePrice: 1000, transport: 100, commission: 50, storage: 25 }), 825);
});

test('the pitch-deck example: FPO Combined Lot nets ₹1,520 and is ranked best', () => {
  const ranked = rankOptions(D.LOT_OPTIONS['LOT-1042']);
  assert.equal(ranked[0].label, 'FPO Combined Lot');
  assert.equal(ranked[0].net, 1520);
  assert.equal(ranked[0].best, true);
  assert.equal(ranked.filter((o) => o.best).length, 1);
});

test('the highest headline price does not win once costs are counted', () => {
  const ranked = rankOptions(D.LOT_OPTIONS['LOT-1042']);
  const highestHeadline = [...ranked].sort((a, b) => b.basePrice - a.basePrice)[0];
  assert.equal(highestHeadline.label, 'Lasalgaon Mandi');
  assert.notEqual(highestHeadline.label, ranked[0].label);
});

test('rankOptions does not mutate its input and sorts by net descending', () => {
  const input = [
    { id: 'a', basePrice: 100, transport: 10, commission: 0, storage: 0, verified: true, reliability: 4 },
    { id: 'b', basePrice: 120, transport: 10, commission: 0, storage: 0, verified: true, reliability: 4 },
  ];
  const snapshot = JSON.stringify(input);
  const out = rankOptions(input);
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(out.map((o) => o.id), ['b', 'a']);
});

test('ties break toward the verified, more reliable buyer', () => {
  const out = rankOptions([
    { id: 'risky', basePrice: 100, transport: 0, commission: 0, storage: 0, verified: false, reliability: 3.2 },
    { id: 'safe', basePrice: 100, transport: 0, commission: 0, storage: 0, verified: true, reliability: 4.8 },
  ]);
  assert.equal(out[0].id, 'safe');
});

/* ---------- quality-to-buyer matching ---------- */

test('exporters that only take Premium never appear for Grade B tomatoes', () => {
  const opts = generateOptions({ crop: 'Tomato', grade: 'Grade B', quantity: 30 });
  assert.ok(!opts.some((o) => o.buyerId === 'B1'));
  const premium = generateOptions({ crop: 'Tomato', grade: 'Premium Quality', quantity: 30 });
  assert.ok(premium.some((o) => o.buyerId === 'B1'));
});

test('generateOptions returns [] for an unknown crop and never throws', () => {
  assert.deepEqual(generateOptions({ crop: 'Dragonfruit', grade: 'Grade A' }), []);
});

test('every generated option has finite money fields and exactly one best', () => {
  for (const c of D.COMMODITIES) {
    for (const grade of ['Premium Quality', 'Grade A', 'Grade B']) {
      const opts = generateOptions({ crop: c.name, grade, quantity: 10 });
      assert.ok(opts.length > 0, `${c.name}/${grade} produced no options`);
      assert.equal(opts.filter((o) => o.best).length, 1);
      for (const o of opts) for (const k of ['basePrice', 'transport', 'commission', 'storage', 'net']) {
        assert.ok(Number.isFinite(o[k]), `${c.name}/${grade}/${o.id}.${k} = ${o[k]}`);
      }
    }
  }
});

test('getOptions prefers the hand-tuned options for the demo lot', () => {
  assert.equal(getOptions({ id: 'LOT-1042', crop: 'Tomato', grade: 'Premium Quality' }), D.LOT_OPTIONS['LOT-1042']);
});

/* ---------- sell or hold ---------- */

test('sell-or-hold verdicts for every commodity', () => {
  const expected = {
    Tomato: ['SELL SOON', 74], Onion: ['SELL NOW', 92], Wheat: ['HOLD', 65],
    Cotton: ['HOLD', 81], Soybean: ['SELL NOW', 78],
  };
  for (const [name, [verdict, confidence]] of Object.entries(expected)) {
    const a = sellOrHoldAnalysis(commodity(name));
    assert.equal(a.verdict, verdict, name);
    assert.equal(a.confidence, confidence, name);
    assert.ok(a.reasons.length >= 2, `${name} must explain itself`);
  }
});

test('a perishable crop is never told to HOLD, whatever the forecast', () => {
  for (const forecast of ['rising', 'falling', 'stable']) {
    for (const name of ['Tomato', 'Onion']) {
      const a = sellOrHoldAnalysis({ ...commodity(name), forecast });
      assert.notEqual(a.verdict, 'HOLD', `${name}/${forecast}`);
    }
  }
});

test('a falling market is always SELL NOW, even for grain', () => {
  for (const name of ['Wheat', 'Cotton', 'Soybean']) {
    assert.equal(sellOrHoldAnalysis({ ...commodity(name), forecast: 'falling' }).verdict, 'SELL NOW');
  }
});

test('sell-or-hold survives a missing, short or zero-price trend', () => {
  for (const trend of [undefined, [], [100], [0, 0, 0, 0, 0, 0, 0]]) {
    const a = sellOrHoldAnalysis({ ...commodity('Wheat'), trend });
    assert.ok(Number.isFinite(a.change3d) && Number.isFinite(a.change7d));
    assert.ok(a.verdict);
  }
});

test('the lot quantity is mentioned in the reasons when supplied', () => {
  const a = sellOrHoldAnalysis(commodity('Tomato'), { quantity: 30, unit: 'Quintals' });
  assert.ok(a.reasons.some((r) => r.includes('30 Quintals')));
});

/* ---------- storage economics ---------- */

test('selling today (0 days) has zero gain and costs nothing', () => {
  const r = storageEconomics({ commodity: commodity('Wheat'), quantity: 50, days: 0, facility: facility('S2') });
  assert.equal(r.gainPerQtl, 0);
  assert.equal(r.storageCost, 0);
  assert.equal(r.spoilageLoss, 0);
  assert.equal(r.better, 'sell');
});

test('storage cost scales linearly with days and uses the facility rate', () => {
  const r = storageEconomics({ commodity: commodity('Wheat'), quantity: 10, days: 10, facility: facility('S2') });
  assert.equal(r.storageCost, 15); // ₹1.5 × 10 days
});

test('perishables lose far more per day than grain, and cold storage helps', () => {
  const cold = facility('S1');
  assert.ok(spoilagePctPerDay('Tomato', null) > spoilagePctPerDay('Wheat', null) * 10);
  assert.ok(spoilagePctPerDay('Tomato', cold) < spoilagePctPerDay('Tomato', null));
  assert.ok(spoilagePctPerDay('Wheat', cold) < spoilagePctPerDay('Wheat', null));
});

test('falling onions: holding in the open loses money', () => {
  const r = storageEconomics({ commodity: commodity('Onion'), quantity: 45, days: 14, facility: null });
  assert.ok(r.gainPerQtl < 0);
  assert.equal(r.better, 'sell');
  assert.ok(r.totalGain < 0);
});

test('rising cotton in a dry warehouse: a short hold can pay', () => {
  const r = storageEconomics({ commodity: commodity('Cotton'), quantity: 15, days: 7, facility: facility('S2') });
  assert.ok(r.gainPerQtl > 0, `gain ${r.gainPerQtl}`);
  assert.equal(r.better, 'store');
  assert.equal(Math.round(r.totalGain), Math.round(r.gainPerQtl * 15));
});

test('a facility that does not suit the crop is flagged and never recommended', () => {
  const r = storageEconomics({ commodity: commodity('Cotton'), quantity: 15, days: 7, facility: facility('S1') });
  assert.equal(r.unsuitable, true);
  assert.equal(r.better, 'sell');
});

test('storageEconomics clamps silly inputs instead of producing NaN', () => {
  const r = storageEconomics({ commodity: commodity('Wheat'), quantity: 'abc', days: -5, facility: null });
  assert.equal(r.days, 0);
  assert.equal(r.quantity, 0);
  for (const k of ['sellNow', 'projectedPrice', 'netHold', 'gainPerQtl', 'totalGain']) assert.ok(Number.isFinite(r[k]), k);
  const long = storageEconomics({ commodity: commodity('Tomato'), quantity: 1, days: 99999, facility: null });
  assert.equal(long.days, 90);
  assert.ok(long.spoilPct <= 100 && long.netHold >= -long.storageCost);
});

test('compareHoldPeriods picks the best period, or none when nothing pays', () => {
  const good = compareHoldPeriods({ commodity: commodity('Cotton'), quantity: 15, facility: facility('S2') });
  assert.equal(good.rows.length, 4);
  assert.ok(good.best && good.best.gainPerQtl > 0);
  const bad = compareHoldPeriods({ commodity: commodity('Onion'), quantity: 45, facility: null });
  assert.equal(bad.best, null);
});

/* ---------- FPO pooling ---------- */

const tomatoPool = D.POOLS.find((p) => p.id === 'P1');

test('pool pricing: no tier below the first threshold', () => {
  const s = poolStatus(tomatoPool, 10); // 70 + 10 = 80 < 100
  assert.equal(s.total, 80);
  assert.equal(s.tier, null);
  assert.equal(s.pricePerQtl, tomatoPool.basePrice);
  assert.equal(s.next.minQty, 100);
  assert.equal(s.toNext, 20);
  assert.equal(s.myExtraEarnings, 0);
});

test('joining with enough quintals unlocks a tier for the whole pool', () => {
  const s = poolStatus(tomatoPool, 30); // 100 → first tier
  assert.equal(s.tier.minQty, 100);
  assert.equal(s.uplift, 40);
  assert.equal(s.pricePerQtl, tomatoPool.basePrice + 40);
  assert.equal(s.myExtraEarnings, 30 * 40);
  assert.equal(s.upliftUnlockedByMe, 40);
});

test('reaching the target fills the pool at the top tier', () => {
  const s = poolStatus(tomatoPool, 80); // 150
  assert.equal(s.filled, true);
  assert.equal(s.progressPct, 100);
  assert.equal(s.next, null);
  assert.equal(s.uplift, 90);
});

test('if the pool already crossed a tier, my joining does not claim credit for it', () => {
  const crowded = { ...tomatoPool, pooledQty: 120 };
  const s = poolStatus(crowded, 5);
  assert.equal(s.uplift, 40);
  assert.equal(s.upliftUnlockedByMe, 0);
});

test('poolStatus tolerates junk quantities and unsorted tiers', () => {
  const messy = { ...tomatoPool, tiers: [...tomatoPool.tiers].reverse() };
  assert.equal(poolStatus(messy, -50).total, 70);
  assert.equal(poolStatus(messy, 'x').total, 70);
  assert.equal(poolStatus(messy, 30).uplift, 40);
});

test('pool price never decreases as more quintals are added', () => {
  for (const pool of D.POOLS) {
    let last = -1;
    for (let q = 0; q <= pool.targetQty; q += 5) {
      const price = poolStatus(pool, q).pricePerQtl;
      assert.ok(price >= last, `${pool.id} at ${q}`);
      last = price;
    }
  }
});

/* ---------- shared transport ---------- */

const trip = D.SHARED_TRIPS[0];

test('per-quintal cost falls as the truck fills', () => {
  const small = sharedTripCost(trip, 5);
  const big = sharedTripCost(trip, 30);
  assert.ok(big.perQtl < small.perQtl);
});

test('sharing is never more expensive than hiring a vehicle alone for these trips', () => {
  for (const t of D.SHARED_TRIPS) {
    for (const qty of [5, 10, 15]) {
      if (qty > t.capacityQtl - t.bookedQtl) continue;
      const c = sharedTripCost(t, qty);
      assert.ok(c.myCost <= c.soloCost, `${t.id}/${qty}: ${c.myCost} vs ${c.soloCost}`);
      assert.ok(c.saving >= 0);
    }
  }
});

test('a booking larger than the seats left does not fit', () => {
  const seats = trip.capacityQtl - trip.bookedQtl;
  assert.equal(sharedTripCost(trip, seats).fits, true);
  assert.equal(sharedTripCost(trip, seats + 1).fits, false);
  assert.equal(sharedTripCost(trip, 0).fits, false);
});

test('everyone on board together pay exactly the trip cost', () => {
  const full = sharedTripCost({ ...trip, bookedQtl: 0 }, trip.capacityQtl);
  assert.ok(Math.abs(full.myCost - full.totalCost) < 1e-6);
});

/* ---------- 24-hour cancel window ---------- */

test('cancel window: open just inside 24 h, closed exactly at and after 24 h', () => {
  const t0 = 1_000_000_000_000;
  assert.equal(offerCancelWindow(t0, t0).canCancel, true);
  assert.equal(offerCancelWindow(t0, t0 + CANCEL_WINDOW_MS - 1).canCancel, true);
  assert.equal(offerCancelWindow(t0, t0 + CANCEL_WINDOW_MS).canCancel, false);
  assert.equal(offerCancelWindow(t0, t0 + CANCEL_WINDOW_MS + 5000).canCancel, false);
});

test('cancel window reports hours and minutes left', () => {
  const t0 = 1_000_000_000_000;
  const w = offerCancelWindow(t0, t0 + 2 * 3600000 + 30 * 60000);
  assert.equal(w.hours, 21);
  assert.equal(w.mins, 30);
});

test('no acceptance time means nothing to cancel', () => {
  for (const v of [undefined, null, 0]) assert.equal(offerCancelWindow(v).canCancel, false);
});

/* ---------- grievances ---------- */

test('grievance validation', () => {
  assert.equal(validateGrievance({ type: 'Payment delay', description: 'Buyer has not paid for 10 days' }), null);
  assert.match(validateGrievance({ type: 'Nonsense', description: 'long enough text here' }), /issue type/i);
  assert.match(validateGrievance({ type: 'Other', description: 'short' }), /at least/);
  assert.match(validateGrievance({ type: 'Other', description: '         ' }), /at least/);
  assert.match(validateGrievance({ type: 'Other', description: 'x'.repeat(1001) }), /under 1000/);
  assert.match(validateGrievance({}), /issue type/i);
});

test('grievance lifecycle moves forward and then stops', () => {
  assert.deepEqual(GRIEVANCE_STATUSES, ['Submitted', 'Under Review', 'Resolved']);
  assert.equal(nextGrievanceStatus('Submitted'), 'Under Review');
  assert.equal(nextGrievanceStatus('Under Review'), 'Resolved');
  assert.equal(nextGrievanceStatus('Resolved'), null);
  assert.equal(nextGrievanceStatus('bogus'), null);
});

/* ---------- quality pre-grading ---------- */

test('exactly the six agreed compliance checks, in order', () => {
  assert.deepEqual(QUALITY_FACTORS.map((f) => f.key), ['colour', 'size', 'shape', 'defects', 'maturity', 'disease']);
});

test('grading is deterministic: the same photo always grades the same', () => {
  const a = gradeQualityFactors({ name: 'tomato-lot.jpg', size: 91234 });
  const b = gradeQualityFactors({ name: 'tomato-lot.jpg', size: 91234 });
  assert.deepEqual(a, b);
});

test('every score is 70–99 and the pass flag matches the 85 threshold', () => {
  for (let i = 0; i < 200; i++) {
    for (const f of gradeQualityFactors({ name: `photo-${i}.jpg`, size: i * 7919 })) {
      assert.ok(f.score >= 70 && f.score <= 99, `score ${f.score}`);
      assert.equal(f.status, f.score >= 85 ? 'pass' : 'warn');
    }
  }
});

test('overall grade thresholds', () => {
  const mk = (s) => QUALITY_FACTORS.map((f) => ({ ...f, score: s }));
  assert.equal(overallGradeFrom(mk(95)), 'Premium Quality');
  assert.equal(overallGradeFrom(mk(90)), 'Premium Quality');
  assert.equal(overallGradeFrom(mk(89)), 'Grade A');
  assert.equal(overallGradeFrom(mk(78)), 'Grade A');
  assert.equal(overallGradeFrom(mk(77)), 'Grade B');
  assert.equal(overallGradeFrom([]), 'Grade B');
});

test('grading tolerates a missing file object', () => {
  assert.equal(gradeQualityFactors(undefined).length, 6);
  assert.equal(gradeQualityFactors({}).length, 6);
});

test('hashScore stays within 0–99', () => {
  for (const s of ['', 'a', 'tomato.jpg12345', '🍅'.repeat(50)]) assert.ok(hashScore(s, 3) >= 0 && hashScore(s, 3) <= 99);
});
