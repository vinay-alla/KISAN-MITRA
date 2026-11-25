"""Grievances, FPO pools, shared trips, bookings, notifications, the mandi proxy and admin."""
import json
import re
import time
import urllib.parse
import urllib.request

from .core import admin_ok, audit, grievance_dict, notify, route, require_role
from .db import loads
from .seed import catalogue
from .util import ApiError, bad, client_id, conflict, forbidden, iso, new_id, not_found, now_ms, number, text

GRIEVANCE_TYPES = ('Quality dispute', 'Payment delay', 'Logistics issue', 'Buyer unreachable', 'Other')
GRIEVANCE_STATUSES = ('Submitted', 'Under Review', 'Resolved')
CLOSED_LOT_STATUSES = ('Offer Accepted', 'Pending Pickup', 'Payment Received', 'Sold')


# ------------------------------------------------------------------ grievances

def _next_status(status):
    i = GRIEVANCE_STATUSES.index(status)
    return GRIEVANCE_STATUSES[i + 1] if i + 1 < len(GRIEVANCE_STATUSES) else None


@route('POST', '/api/grievances')
def create_grievance(ctx):
    b = ctx.body()
    if b.get('type') not in GRIEVANCE_TYPES:
        raise bad('type must be one of: ' + ', '.join(GRIEVANCE_TYPES))
    description = text(b.get('description'), 'Description', min_len=10, max_len=1000, collapse=False)
    ref = text(b.get('ref'), 'Reference', max_len=24, required=False)
    if ref and not re.fullmatch(r'ORD-\d{3,6}', ref):
        raise bad('ref must be an order id like ORD-1234.')
    wanted = client_id(b.get('id'), 'GR')
    now = now_ms()
    with ctx.db.transaction() as c:
        gid = wanted
        if gid and c.execute('SELECT 1 FROM grievances WHERE id = ?', (gid,)).fetchone():
            raise conflict(f'{gid} already exists.', 'id_taken')
        while not gid:
            cand = new_id('GR', 6)
            gid = cand if not c.execute('SELECT 1 FROM grievances WHERE id = ?', (cand,)).fetchone() else None
        c.execute('INSERT INTO grievances(id, user_id, type, description, ref, created_at) VALUES (?,?,?,?,?,?)',
                  (gid, ctx.user['id'], b['type'], description, ref, now))
        c.execute("INSERT INTO grievance_events(grievance_id, status, at, by_user) VALUES (?, 'Submitted', ?, ?)", (gid, now, ctx.user['id']))
    audit(ctx, 'grievance_create', 'grievance', gid)
    return 201, {'grievance': grievance_dict(ctx.db, ctx.db.one('SELECT * FROM grievances WHERE id = ?', (gid,)))}


@route('GET', '/api/grievances')
def list_grievances(ctx):
    rows = ctx.db.all('SELECT * FROM grievances WHERE user_id = ? ORDER BY created_at DESC LIMIT 200', (ctx.user['id'],))
    return {'grievances': [grievance_dict(ctx.db, r) for r in rows]}


@route('GET', '/api/grievances/<gid>')
def get_grievance(ctx):
    row = ctx.db.one('SELECT * FROM grievances WHERE id = ? AND user_id = ?', (ctx.params['gid'], ctx.user['id']))
    if not row:
        raise not_found('Grievance')
    return {'grievance': grievance_dict(ctx.db, row)}


def _advance(ctx, gid, by_user, owner_only_id=None):
    now = now_ms()
    with ctx.db.transaction() as c:
        row = c.execute('SELECT * FROM grievances WHERE id = ?' + (' AND user_id = ?' if owner_only_id else ''),
                        (gid, owner_only_id) if owner_only_id else (gid,)).fetchone()
        if not row:
            raise not_found('Grievance')
        nxt = _next_status(row['status'])
        if not nxt:
            raise conflict('This grievance is already resolved.', 'already_resolved')
        c.execute('UPDATE grievances SET status = ? WHERE id = ?', (nxt, gid))
        c.execute('INSERT INTO grievance_events(grievance_id, status, at, by_user) VALUES (?,?,?,?)', (gid, nxt, now, by_user))
        notify(c, row['user_id'], 'grievance', f'Grievance {gid}: {nxt}', row['type'], '#/grievances')
    return grievance_dict(ctx.db, ctx.db.one('SELECT * FROM grievances WHERE id = ?', (gid,)))


@route('POST', '/api/grievances/<gid>/advance')
def advance_grievance(ctx):
    """Demo mode only: stands in for a support agent so the flow can be exercised end to end."""
    if not ctx.cfg.demo_mode:
        raise forbidden('Only support staff can change a grievance status.')
    return {'grievance': _advance(ctx, ctx.params['gid'], ctx.user['id'], owner_only_id=ctx.user['id'])}


# ------------------------------------------------------------------ FPO pools

def pool_status(pool, my_qty=0):
    tiers = sorted(json.loads(pool['tiers_json']), key=lambda t: t['minQty'])
    total = pool['_others'] + my_qty
    reached = [t for t in tiers if total >= t['minQty']]
    tier = reached[-1] if reached else None
    nxt = next((t for t in tiers if total < t['minQty']), None)
    uplift = tier['uplift'] if tier else 0
    return {
        'total': total, 'tier': tier, 'next': nxt, 'toNext': (nxt['minQty'] - total) if nxt else 0,
        'pricePerQtl': pool['base_price'] + uplift, 'uplift': uplift,
        'progressPct': max(0, min(100, total / pool['target_qty'] * 100)), 'filled': total >= pool['target_qty'],
    }


def _pool_view(ctx, row, uid):
    contribs = ctx.db.all('SELECT user_id, qty FROM pool_contributions WHERE pool_id = ?', (row['id'],))
    mine = next((c['qty'] for c in contribs if c['user_id'] == uid), 0)
    others = row['base_pooled_qty'] + sum(c['qty'] for c in contribs if c['user_id'] != uid)
    pool = {**dict(row), '_others': others}
    return {
        'id': row['id'], 'crop': row['crop'], 'grade': row['grade'], 'buyer': row['buyer'], 'basePrice': row['base_price'],
        'targetQty': row['target_qty'], 'closes': row['closes'], 'tiers': json.loads(row['tiers_json']),
        'pooledQty': others, 'myQty': mine, 'members': len(contribs), 'status': pool_status(pool, mine),
    }


@route('GET', '/api/pools')
def list_pools(ctx):
    return {'pools': [_pool_view(ctx, r, ctx.user['id']) for r in ctx.db.all('SELECT * FROM pools ORDER BY id')]}


@route('PUT', '/api/pools/<pid>/contribution', roles=('farmer',))
def set_contribution(ctx):
    qty = number(ctx.body().get('qty'), 'qty', minimum=1, maximum=100_000)
    now = now_ms()
    with ctx.db.transaction() as c:
        pool = c.execute('SELECT * FROM pools WHERE id = ?', (ctx.params['pid'],)).fetchone()
        if not pool:
            raise not_found('Pool')
        have = c.execute(
            f"SELECT COALESCE(SUM(quantity), 0) AS q FROM lots WHERE user_id = ? AND crop = ? AND status NOT IN {CLOSED_LOT_STATUSES!r}",
            (ctx.user['id'], pool['crop'])).fetchone()['q']
        if qty > have:
            raise conflict(f"You only have {have:g} qtl of {pool['crop']} available to pool.", 'insufficient_stock')
        others = pool['base_pooled_qty'] + c.execute('SELECT COALESCE(SUM(qty),0) AS q FROM pool_contributions WHERE pool_id = ? AND user_id != ?', (pool['id'], ctx.user['id'])).fetchone()['q']
        room = pool['target_qty'] - others
        if qty > room:
            raise conflict(f"This pool only has room for {max(room, 0):g} more quintals.", 'pool_full')
        c.execute('INSERT INTO pool_contributions(pool_id, user_id, qty, updated_at) VALUES (?,?,?,?)'
                  ' ON CONFLICT(pool_id, user_id) DO UPDATE SET qty = excluded.qty, updated_at = excluded.updated_at', (pool['id'], ctx.user['id'], qty, now))
    audit(ctx, 'pool_join', 'pool', ctx.params['pid'])
    return {'pool': _pool_view(ctx, ctx.db.one('SELECT * FROM pools WHERE id = ?', (ctx.params['pid'],)), ctx.user['id'])}


@route('DELETE', '/api/pools/<pid>/contribution', roles=('farmer',))
def clear_contribution(ctx):
    pool = ctx.db.one('SELECT * FROM pools WHERE id = ?', (ctx.params['pid'],))
    if not pool:
        raise not_found('Pool')
    ctx.db.conn().execute('DELETE FROM pool_contributions WHERE pool_id = ? AND user_id = ?', (pool['id'], ctx.user['id']))
    return {'pool': _pool_view(ctx, pool, ctx.user['id'])}


# ------------------------------------------------------------------ shared trips

def trip_quote(trip, others, mine):
    total = trip['rate_per_km'] * trip['distance_km']
    loaded = min(trip['capacity_qtl'], others + mine)
    per_qtl = total / loaded if loaded > 0 else total
    solo_vehicles = max(1, -(-mine // trip['solo_capacity_qtl'])) if mine > 0 else 1
    solo = solo_vehicles * trip['solo_rate_per_km'] * trip['distance_km']
    return {'totalCost': total, 'perQtl': per_qtl, 'myCost': per_qtl * mine, 'soloCost': solo, 'saving': max(0, solo - per_qtl * mine)}


def _trip_view(ctx, row, uid):
    books = ctx.db.all('SELECT * FROM trip_bookings WHERE trip_id = ?', (row['id'],))
    mine = next((b for b in books if b['user_id'] == uid), None)
    others = row['base_booked_qtl'] + sum(b['qty'] for b in books if b['user_id'] != uid)
    return {
        'id': row['id'], 'route': row['route'], 'when': row['when_text'], 'providerId': row['provider_id'], 'vehicle': row['vehicle'],
        'capacityQtl': row['capacity_qtl'], 'bookedQtl': others, 'seatsLeft': max(0, row['capacity_qtl'] - others - (mine['qty'] if mine else 0)),
        'distanceKm': row['distance_km'], 'ratePerKm': row['rate_per_km'],
        'myBooking': {'qty': mine['qty'], 'perQtl': mine['per_qtl'], 'myCost': mine['my_cost'], 'at': mine['created_at']} if mine else None,
    }


@route('GET', '/api/trips')
def list_trips(ctx):
    return {'trips': [_trip_view(ctx, r, ctx.user['id']) for r in ctx.db.all('SELECT * FROM shared_trips ORDER BY id')]}


@route('POST', '/api/trips/<tid>/book', roles=('farmer', 'fpo_operator'))
def book_trip(ctx):
    qty = number(ctx.body().get('qty'), 'qty', minimum=1, maximum=100_000)
    now = now_ms()
    with ctx.db.transaction() as c:
        trip = c.execute('SELECT * FROM shared_trips WHERE id = ?', (ctx.params['tid'],)).fetchone()
        if not trip:
            raise not_found('Trip')
        if c.execute('SELECT 1 FROM trip_bookings WHERE trip_id = ? AND user_id = ?', (trip['id'], ctx.user['id'])).fetchone():
            raise conflict('You already have a seat on this trip. Cancel it first to change the quantity.', 'already_booked')
        others = trip['base_booked_qtl'] + c.execute('SELECT COALESCE(SUM(qty),0) AS q FROM trip_bookings WHERE trip_id = ?', (trip['id'],)).fetchone()['q']
        left = trip['capacity_qtl'] - others
        if qty > left:
            raise conflict(f'Only {max(left, 0):g} qtl of space is left on this trip.' if left > 0 else 'This trip is full.', 'trip_full')
        q = trip_quote(trip, others, qty)
        c.execute('INSERT INTO trip_bookings(trip_id, user_id, qty, per_qtl, my_cost, created_at) VALUES (?,?,?,?,?,?)',
                  (trip['id'], ctx.user['id'], qty, q['perQtl'], q['myCost'], now))
    audit(ctx, 'trip_book', 'trip', ctx.params['tid'])
    return 201, {'trip': _trip_view(ctx, ctx.db.one('SELECT * FROM shared_trips WHERE id = ?', (ctx.params['tid'],)), ctx.user['id'])}


@route('DELETE', '/api/trips/<tid>/book', roles=('farmer', 'fpo_operator'))
def cancel_trip(ctx):
    trip = ctx.db.one('SELECT * FROM shared_trips WHERE id = ?', (ctx.params['tid'],))
    if not trip:
        raise not_found('Trip')
    ctx.db.conn().execute('DELETE FROM trip_bookings WHERE trip_id = ? AND user_id = ?', (trip['id'], ctx.user['id']))
    return {'trip': _trip_view(ctx, trip, ctx.user['id'])}


# ------------------------------------------------------------------ transport / storage bookings

@route('POST', '/api/bookings')
def create_booking(ctx):
    b = ctx.body()
    kind = b.get('type')
    cat = catalogue()
    pools = {'transport': cat['transportProviders'], 'storage': cat['storageFacilities']}
    if not isinstance(kind, str) or kind not in pools:   # (a list/dict would be unhashable)
        raise bad("type must be 'transport' or 'storage'.")
    item = next((x for x in pools[kind] if x['name'] == b.get('name')), None)
    if not item:
        raise not_found('Provider')
    now = now_ms()
    with ctx.db.transaction() as c:
        if c.execute('SELECT 1 FROM bookings WHERE user_id = ? AND type = ? AND name = ?', (ctx.user['id'], kind, item['name'])).fetchone():
            raise conflict('Already booked.', 'already_booked')
        cur = c.execute('INSERT INTO bookings(user_id, type, name, ref_id, created_at) VALUES (?,?,?,?,?)', (ctx.user['id'], kind, item['name'], item['id'], now))
    return 201, {'booking': {'id': cur.lastrowid, 'type': kind, 'name': item['name'], 'date': now}}


@route('GET', '/api/bookings')
def list_bookings(ctx):
    rows = ctx.db.all('SELECT * FROM bookings WHERE user_id = ? ORDER BY id', (ctx.user['id'],))
    return {'bookings': [{'id': r['id'], 'type': r['type'], 'name': r['name'], 'date': r['created_at']} for r in rows]}


@route('DELETE', '/api/bookings/<bid>')
def delete_booking(ctx):
    cur = ctx.db.conn().execute('DELETE FROM bookings WHERE id = ? AND user_id = ?', (ctx.params['bid'], ctx.user['id']))
    if cur.rowcount == 0:
        raise not_found('Booking')
    return {'ok': True}


# ------------------------------------------------------------------ notifications

@route('GET', '/api/notifications')
def list_notifications(ctx):
    only_unread = ctx.q('unread') in ('1', 'true')
    rows = ctx.db.all(
        'SELECT * FROM notifications WHERE user_id = ?' + (' AND read_at IS NULL' if only_unread else '') + ' ORDER BY id DESC LIMIT ?',
        (ctx.user['id'], ctx.q_int('limit', 30, 1, 100)))
    unread = ctx.db.one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', (ctx.user['id'],))['n']
    return {'unread': unread, 'notifications': [
        {'id': r['id'], 'kind': r['kind'], 'title': r['title'], 'body': r['body'], 'link': r['link'], 'at': iso(r['created_at']), 'read': r['read_at'] is not None} for r in rows]}


@route('POST', '/api/notifications/read')
def mark_read(ctx):
    b = ctx.body() if ctx.raw_body else {}
    c = ctx.db.conn()
    ids = b.get('ids')
    if isinstance(ids, list) and ids:
        clean = [int(i) for i in ids if isinstance(i, int) and not isinstance(i, bool)][:200]
        if clean:
            c.execute(f"UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN ({','.join('?' * len(clean))})", (now_ms(), ctx.user['id'], *clean))
    else:
        c.execute('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', (now_ms(), ctx.user['id']))
    return {'ok': True}


# ------------------------------------------------------------------ live mandi prices (proxy, cached)

MANDI_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070'
_mandi_cache: dict[str, tuple[float, bytes]] = {}


@route('GET', '/api/mandi', auth='none')
def mandi_proxy(ctx):
    if not ctx.cfg.mandi_api_key:
        raise ApiError(503, 'mandi_disabled', 'DATA_GOV_IN_API_KEY is not set; live prices are disabled.')
    commodity, state = ctx.q('commodity', ''), ctx.q('state', '')
    if len(commodity) > 40 or len(state) > 40:
        raise bad('commodity/state too long.')
    key = f'{commodity}|{state}'
    hit = _mandi_cache.get(key)
    if hit and time.time() - hit[0] < 300:
        return ('raw', hit[1])
    params = {'api-key': ctx.cfg.mandi_api_key, 'format': 'json', 'limit': '12', 'filters[commodity]': commodity}
    if state:
        params['filters[state]'] = state
    url = f'https://api.data.gov.in/resource/{MANDI_RESOURCE}?' + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            body = resp.read()
    except Exception as e:   # network error, bad key, rate limit: the UI falls back to sample data
        raise ApiError(502, 'upstream_error', f'Mandi feed unavailable: {e}')
    _mandi_cache[key] = (time.time(), body)
    return ('raw', body)


# ------------------------------------------------------------------ admin (X-Admin-Key)

@route('GET', '/api/admin/stats', auth='admin')
def admin_stats(ctx):
    one = lambda sql: ctx.db.one(sql)['n']
    return {
        'users': {r['role']: r['n'] for r in ctx.db.all('SELECT role, COUNT(*) AS n FROM users GROUP BY role')},
        'lots': one('SELECT COUNT(*) AS n FROM lots'), 'offers': one('SELECT COUNT(*) AS n FROM offers'),
        'orders': one('SELECT COUNT(*) AS n FROM orders'),
        'orderValue': ctx.db.one('SELECT COALESCE(SUM(amount),0) AS n FROM orders')['n'],
        'openGrievances': one("SELECT COUNT(*) AS n FROM grievances WHERE status != 'Resolved'"),
        'activeSessions': ctx.db.one('SELECT COUNT(*) AS n FROM sessions WHERE revoked = 0 AND expires_at > ?', (now_ms(),))['n'],
    }


@route('GET', '/api/admin/grievances', auth='admin')
def admin_grievances(ctx):
    rows = ctx.db.all('SELECT g.*, u.full_name AS who FROM grievances g JOIN users u ON u.id = g.user_id ORDER BY g.created_at DESC LIMIT 200')
    return {'grievances': [{**grievance_dict(ctx.db, r), 'user': r['who']} for r in rows]}


@route('POST', '/api/admin/grievances/<gid>/advance', auth='admin')
def admin_advance(ctx):
    return {'grievance': _advance(ctx, ctx.params['gid'], None)}


@route('GET', '/api/admin/users', auth='admin')
def admin_users(ctx):
    rows = ctx.db.all('SELECT id, phone_display, role, full_name, created_at, last_login_at, is_demo FROM users ORDER BY id LIMIT 500')
    return {'users': [{'id': r['id'], 'phone': r['phone_display'], 'role': r['role'], 'name': r['full_name'], 'createdAt': iso(r['created_at']),
                       'lastLoginAt': iso(r['last_login_at']), 'demo': bool(r['is_demo'])} for r in rows]}
