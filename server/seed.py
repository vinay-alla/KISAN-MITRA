"""Loads the catalogue (server/seed.json, exported from js/data.js) and seeds the database."""
import json
from functools import lru_cache
from pathlib import Path

from .security import hash_password
from .util import now_ms, phone_key

SEED_PATH = Path(__file__).with_name('seed.json')
DEMO_PASSWORD = 'demo123'
PROFILE_KEYS = ('weather', 'memberSince', 'verified', 'reliability', 'designation')


@lru_cache(maxsize=1)
def catalogue() -> dict:
    return json.loads(SEED_PATH.read_text(encoding='utf-8'))


def seed_catalogue(db):
    """Pools and shared trips are definitions the server owns; contributions/bookings reference them."""
    cat = catalogue()
    with db.transaction() as c:
        for p in cat['pools']:
            c.execute(
                'INSERT OR IGNORE INTO pools(id, crop, grade, buyer_ref, buyer, base_price, target_qty, base_pooled_qty, closes, tiers_json)'
                ' VALUES (?,?,?,?,?,?,?,?,?,?)',
                (p['id'], p['crop'], p['grade'], p.get('buyerId'), p['buyer'], p['basePrice'], p['targetQty'], p['pooledQty'], p['closes'], json.dumps(p['tiers'])))
        for t in cat['sharedTrips']:
            c.execute(
                'INSERT OR IGNORE INTO shared_trips(id, route, when_text, provider_id, vehicle, capacity_qtl, base_booked_qtl, distance_km,'
                ' rate_per_km, solo_vehicle, solo_rate_per_km, solo_capacity_qtl) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                (t['id'], t['route'], t['when'], t['providerId'], t['vehicle'], t['capacityQtl'], t['bookedQtl'], t['distanceKm'],
                 t['ratePerKm'], t['soloVehicle'], t['soloRatePerKm'], t['soloCapacityQtl']))


def seed_demo_users(db):
    """The three demo accounts the login screen's "Try Demo" buttons use, plus the demo farmer's lots."""
    cat = catalogue()
    now = now_ms()
    pw_hash = None
    farmer_id = None
    with db.transaction() as c:
        for u in cat['demoUsers']:
            key = phone_key(u['phone'])
            if c.execute('SELECT 1 FROM users WHERE phone = ?', (key,)).fetchone():
                continue
            pw_hash = pw_hash or hash_password(DEMO_PASSWORD)
            profile = {k: u[k] for k in PROFILE_KEYS if k in u}
            c.execute(
                'INSERT INTO users(phone, phone_display, role, full_name, name, password_hash, location, company, fpo, language, profile_json, is_demo, created_at)'
                ' VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)',
                (key, u['phone'], u['role'], u['fullName'], u['name'], pw_hash, u.get('location', ''), u.get('company'), u.get('fpo'),
                 u.get('language', 'English'), json.dumps(profile), now))
        row = c.execute("SELECT id FROM users WHERE role = 'farmer' AND is_demo = 1 ORDER BY id LIMIT 1").fetchone()
        farmer_id = row['id'] if row else None
        if farmer_id:
            for lot in cat['demoLots']:
                c.execute(
                    'INSERT OR IGNORE INTO lots(id, user_id, crop, quantity, unit, grade, harvest_date, location, status, created_at, updated_at)'
                    ' VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                    (lot['id'], farmer_id, lot['crop'], lot['quantity'], lot['unit'], lot['grade'], lot['harvestDate'], lot['location'], lot['status'], now, now))
