// Exports the catalogue data the backend needs from js/data.js, so the front end and the
// server share one source of truth. Run after editing data.js:
//   node scripts/export-seed.mjs
// tests/seed.test.js fails if server/seed.json is stale.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as D from '../js/data.js';

export function buildSeed() {
  return {
    demoUsers: [D.DEFAULT_FARMER, D.DEFAULT_BUYER, D.DEFAULT_FPO_OPERATOR],
    demoLots: D.LOTS,
    availableLots: D.AVAILABLE_LOTS,
    pools: D.POOLS,
    sharedTrips: D.SHARED_TRIPS,
    storageFacilities: D.STORAGE_FACILITIES,
    transportProviders: D.TRANSPORT_PROVIDERS,
    buyers: D.BUYERS,
    commodities: D.COMMODITIES.map((c) => ({ id: c.id, name: c.name, unit: c.unit, trend: c.trend, forecast: c.forecast, mandis: c.mandis })),
    orderStages: D.ORDER_STAGES,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server/seed.json');
  writeFileSync(out, JSON.stringify(buildSeed(), null, 2) + '\n');
  console.log('wrote', out);
}
