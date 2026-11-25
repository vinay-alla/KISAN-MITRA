"""Multi-user load and consistency simulation.

    python -m server.simulate --farmers 30 --buyers 20 --steps 40

Boots a throw-away server (or targets --url), signs up many users and has them act at the same time:
farmers list lots, join pools, book seats, accept bids, advance orders, raise grievances; buyers bid,
withdraw and advance orders. Afterwards it audits the database for broken invariants (overfilled
pools or trucks, orders whose money doesn't add up, a lot accepted twice...) and reports 5xx errors
and latency. Exit code is non-zero if anything is wrong.
"""
import argparse
import json
import random
import sqlite3
import statistics
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

CROPS = ['Tomato', 'Onion', 'Wheat', 'Soybean', 'Cotton']


class Client:
    def __init__(self, base, stats):
        self.base, self.stats, self.token = base, stats, None

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if data is not None:
            req.add_header('Content-Type', 'application/json')
        if self.token:
            req.add_header('Authorization', f'Bearer {self.token}')
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                status, payload = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, payload = e.code, e.read()
        except Exception as e:   # connection-level failure
            status, payload = 0, str(e).encode()
        self.stats.record(method, path, status, time.time() - t0, payload)
        try:
            return status, json.loads(payload)
        except ValueError:
            return status, {}


class Stats:
    def __init__(self):
        self.lock = threading.Lock()
        self.latencies, self.codes, self.server_errors = [], {}, []

    def record(self, method, path, status, dt, payload):
        with self.lock:
            self.latencies.append(dt)
            self.codes[status] = self.codes.get(status, 0) + 1
            if status == 0 or status >= 500:
                self.server_errors.append(f'{method} {path} -> {status} {payload[:120]!r}')


def farmer_session(base, stats, n, steps, rng):
    c = Client(base, stats)
    s, d = c.call('POST', '/api/auth/register', {'role': 'farmer', 'fullName': f'Sim Farmer {n}', 'phone': f'9{n + 100000000:09d}', 'password': 'simulate1', 'location': 'Nashik, Maharashtra'})
    if s != 201:
        return
    c.token = d['token']
    lots = []
    for _ in range(steps):
        action = rng.choice(['lot', 'lot', 'pool', 'trip', 'accept', 'stage', 'grievance', 'sync', 'ai'])
        if action == 'lot':
            s, d = c.call('POST', '/api/lots', {'crop': rng.choice(CROPS), 'quantity': rng.randint(5, 80), 'grade': rng.choice(['Grade A', 'Grade B', 'Premium Quality'])})
            if s == 201:
                lots.append(d['lot'])
        elif action == 'pool' and lots:
            lot = rng.choice(lots)
            pid = {'Tomato': 'P1', 'Onion': 'P2', 'Wheat': 'P3', 'Soybean': 'P4'}.get(lot['crop'])
            if pid:
                c.call('PUT', f'/api/pools/{pid}/contribution', {'qty': rng.randint(1, 60)})
                if rng.random() < 0.3:
                    c.call('DELETE', f'/api/pools/{pid}/contribution')
        elif action == 'trip':
            tid = rng.choice(['ST1', 'ST2', 'ST3'])
            s, _ = c.call('POST', f'/api/trips/{tid}/book', {'qty': rng.randint(1, 15)})
            if s == 201 and rng.random() < 0.4:
                c.call('DELETE', f'/api/trips/{tid}/book')
        elif action == 'accept' and lots:
            lot = rng.choice(lots)
            s, d = c.call('GET', '/api/offers')
            pend = [o for o in d.get('offers', []) if o['farmerLotId'] == lot['id'] and o['status'] == 'Pending']
            if pend:
                best = max(pend, key=lambda o: o['price'])
                c.call('POST', f"/api/lots/{lot['id']}/accept", {'optionId': best['id'], 'offerId': best['id']})
        elif action == 'stage':
            s, d = c.call('GET', '/api/orders')
            live = [o for o in d.get('orders', []) if o['stage'] < 4]
            if live:
                o = rng.choice(live)
                c.call('POST', f"/api/orders/{o['id']}/stage", {'stage': o['stage'] + 1})
        elif action == 'grievance':
            c.call('POST', '/api/grievances', {'type': 'Payment delay', 'description': 'Simulated grievance text for load testing.'})
        elif action == 'sync':
            c.call('GET', '/api/sync')
        elif action == 'ai':
            c.call('POST', '/api/ai/chat', {'message': 'hello'})   # 503 when AI is off; must never be a 5xx other than that
        time.sleep(rng.random() * 0.02)


def buyer_session(base, stats, n, steps, rng):
    c = Client(base, stats)
    s, d = c.call('POST', '/api/auth/register', {'role': 'buyer', 'fullName': f'Sim Buyer {n}', 'phone': f'8{n + 100000000:09d}', 'password': 'simulate1', 'company': f'Sim Co {n}'})
    if s != 201:
        return
    c.token = d['token']
    for _ in range(steps):
        action = rng.choice(['bid', 'bid', 'bid', 'withdraw', 'stage', 'market', 'notes'])
        if action == 'bid':
            s, d = c.call('GET', '/api/market/lots')
            lots = d.get('lots', [])
            if lots:
                lot = rng.choice(lots)
                c.call('POST', '/api/offers', {'lotId': lot['id'], 'farmerLotId': lot['id'], 'price': rng.randint(900, 7000), 'quantity': rng.randint(1, max(1, int(lot['quantity'])))})
        elif action == 'withdraw':
            s, d = c.call('GET', '/api/offers')
            pend = [o for o in d.get('offers', []) if o['status'] == 'Pending']
            if pend:
                c.call('POST', f"/api/offers/{rng.choice(pend)['id']}/withdraw")
        elif action == 'stage':
            s, d = c.call('GET', '/api/orders')
            live = [o for o in d.get('orders', []) if o['stage'] < 4]
            if live:
                o = rng.choice(live)
                c.call('POST', f"/api/orders/{o['id']}/stage", {'stage': o['stage'] + 1})
        elif action == 'market':
            c.call('GET', '/api/market/lots?crop=' + rng.choice(CROPS))
        else:
            c.call('GET', '/api/notifications')
        time.sleep(rng.random() * 0.02)


def audit_database(db_path):
    """Return a list of broken-invariant descriptions (empty = consistent)."""
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    bad = []
    q = lambda sql, *a: db.execute(sql, a).fetchall()
    for p in q('SELECT p.id, p.target_qty, p.base_pooled_qty, COALESCE(SUM(c.qty),0) AS s FROM pools p LEFT JOIN pool_contributions c ON c.pool_id = p.id GROUP BY p.id'):
        if p['base_pooled_qty'] + p['s'] > p['target_qty'] + 1e-6:
            bad.append(f"pool {p['id']} overfilled: {p['base_pooled_qty'] + p['s']} > {p['target_qty']}")
    for t in q('SELECT t.id, t.capacity_qtl, t.base_booked_qtl, COALESCE(SUM(b.qty),0) AS s FROM shared_trips t LEFT JOIN trip_bookings b ON b.trip_id = t.id GROUP BY t.id'):
        if t['base_booked_qtl'] + t['s'] > t['capacity_qtl'] + 1e-6:
            bad.append(f"trip {t['id']} overbooked: {t['base_booked_qtl'] + t['s']} > {t['capacity_qtl']}")
    for o in q('SELECT id, rate, quantity, amount, stage FROM orders'):
        if abs(o['rate'] * o['quantity'] - o['amount']) > 0.01:
            bad.append(f"order {o['id']} amount {o['amount']} != {o['rate']} x {o['quantity']}")
        if not 0 <= o['stage'] <= 4:
            bad.append(f"order {o['id']} has stage {o['stage']}")
    for r in q("SELECT lot_id, COUNT(*) AS n FROM offers WHERE status = 'Accepted' AND lot_id IS NOT NULL GROUP BY lot_id HAVING n > 1"):
        bad.append(f"lot {r['lot_id']} has {r['n']} accepted offers")
    for r in q("SELECT l.id FROM lots l WHERE l.status = 'Offer Accepted' AND l.user_id NOT IN (SELECT id FROM users WHERE is_demo = 1) AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.lot_id = l.id)"):
        bad.append(f"lot {r['id']} is 'Offer Accepted' but has no order")
    for r in q("SELECT o.id FROM orders o JOIN lots l ON l.id = o.lot_id WHERE o.stage = 4 AND l.status != 'Payment Received'"):
        bad.append(f"order {r['id']} is paid but its lot isn't closed")
    for r in q("SELECT o.id FROM offers o JOIN lots l ON l.id = o.lot_id WHERE o.status = 'Pending' AND l.status = 'Offer Accepted'"):
        bad.append(f"offer {r['id']} still pending on an already-accepted lot")
    for r in q('SELECT COUNT(*) AS n FROM pool_contributions WHERE qty <= 0 UNION ALL SELECT COUNT(*) FROM trip_bookings WHERE qty <= 0'):
        if r['n']:
            bad.append('non-positive quantity stored')
    db.close()
    return bad


def run(base, db_path, farmers=20, buyers=15, steps=30, seed=7):
    stats = Stats()
    rng_master = random.Random(seed)
    threads = []
    # farmers first (so buyers have lots to find), then everyone acts at once
    for i in range(farmers):
        threads.append(threading.Thread(target=farmer_session, args=(base, stats, i, steps, random.Random(rng_master.random()))))
    for i in range(buyers):
        threads.append(threading.Thread(target=buyer_session, args=(base, stats, i, steps, random.Random(rng_master.random()))))
    t0 = time.time()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    elapsed = time.time() - t0
    lat = sorted(stats.latencies)
    report = {
        'requests': len(lat), 'seconds': round(elapsed, 1), 'rps': round(len(lat) / elapsed, 1) if elapsed else 0,
        'p50_ms': round(statistics.median(lat) * 1000, 1) if lat else 0,
        'p95_ms': round(lat[int(len(lat) * 0.95) - 1] * 1000, 1) if lat else 0,
        'status_codes': dict(sorted(stats.codes.items())),
        'server_errors': [e for e in stats.server_errors if 'ai/chat' not in e or ' 503 ' not in e][:20],
        'invariant_violations': audit_database(db_path),
    }
    return report


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--farmers', type=int, default=20)
    ap.add_argument('--buyers', type=int, default=15)
    ap.add_argument('--steps', type=int, default=30)
    ap.add_argument('--seed', type=int, default=7)
    args = ap.parse_args()
    from .app import create_server
    from .config import Config
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / 'sim.db'
        httpd = create_server(Config(db_path=db_path, quiet=True, register_limit=10_000, demo_mode=False), port=0)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{httpd.server_address[1]}'
        report = run(base, db_path, args.farmers, args.buyers, args.steps, args.seed)
        httpd.shutdown()
        httpd.app.db.close()
    print(json.dumps(report, indent=2))
    ok = not report['server_errors'] and not report['invariant_violations']
    print('RESULT:', 'PASS' if ok else 'FAIL')
    raise SystemExit(0 if ok else 1)


if __name__ == '__main__':
    main()
