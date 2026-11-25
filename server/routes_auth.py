"""Health, catalogue, accounts, sessions and the per-user sync snapshot."""
import json
import secrets
from datetime import date

from .core import audit, lot_dict, offer_dict, order_dict, grievance_dict, route, user_public, require_role
from .db import loads
from .security import hash_password, verify_password
from .seed import catalogue
from .util import ApiError, bad, conflict, iso, now_ms, phone_key, text, valid_mobile

ROLES = ('farmer', 'buyer', 'fpo_operator')
LANGUAGES = ('English', 'हिंदी', 'मराठी')


def _issue_token(ctx, user_id):
    jti = secrets.token_urlsafe(12)
    now = now_ms()
    exp = now + ctx.cfg.token_ttl_s * 1000
    ctx.db.conn().execute('INSERT INTO sessions(id, user_id, created_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?)',
                          (jti, user_id, now, exp, ctx.ip, ctx.headers.get('user-agent', '')[:200]))
    return ctx.app.signer.sign({'sub': user_id, 'jti': jti, 'exp': exp // 1000}), exp


def _user_by_id(ctx, uid):
    return ctx.db.one('SELECT * FROM users WHERE id = ?', (uid,))


@route('GET', '/api/health', auth='none')
def health(ctx):
    return {'status': 'ok', 'time': iso(now_ms()), 'demoMode': ctx.cfg.demo_mode, 'liveMandi': bool(ctx.cfg.mandi_api_key),
            'ai': bool(ctx.cfg.ai_key), 'realtime': True, 'online': sum(ctx.app.hub.online().values())}


@route('POST', '/api/stream/ticket')
def stream_ticket(ctx):
    """EventSource can't send an Authorization header, so it authenticates with a short-lived single-purpose ticket
    (rather than putting the long-lived session token in a URL that proxies and logs record)."""
    exp = int(now_ms() / 1000) + 60
    return {'ticket': ctx.app.signer.sign({'sub': ctx.user['id'], 'typ': 'stream', 'sid': ctx.session_id, 'exp': exp}), 'expiresIn': 60}


@route('GET', '/api/catalog', auth='none')
def catalog(ctx):
    cat = catalogue()
    return {k: cat[k] for k in ('commodities', 'transportProviders', 'storageFacilities', 'buyers', 'orderStages')}


@route('POST', '/api/auth/register', auth='none')
def register(ctx):
    wait = ctx.app.limiter.blocked_for(f'register|{ctx.ip}', ctx.cfg.register_limit, 3600)
    if wait:
        raise ApiError(429, 'rate_limited', 'Too many sign-ups from this address. Try again later.', headers={'Retry-After': str(wait)})
    b = ctx.body()
    role = b.get('role')
    if role not in ROLES:
        raise bad('role must be one of: ' + ', '.join(ROLES))
    full_name = text(b.get('fullName'), 'Full name', min_len=2, max_len=60)
    if not valid_mobile(b.get('phone')):
        raise bad('Enter a valid 10-digit Indian mobile number (starting 6-9).', 'invalid_phone')
    password = b.get('password')
    if not isinstance(password, str) or not 6 <= len(password) <= 128:
        raise bad('Password must be 6-128 characters.', 'invalid_password')
    language = b.get('language') if b.get('language') in LANGUAGES else 'English'
    location = text(b.get('location'), 'Location', max_len=80, required=False)
    company = text(b.get('company'), 'Company', max_len=80, required=False) or None
    fpo = text(b.get('fpo'), 'FPO', max_len=80, required=False) or None
    profile = {}
    if isinstance(b.get('weather'), (int, float)) and not isinstance(b.get('weather'), bool):
        profile['weather'] = b['weather']
    key = phone_key(b['phone'])
    ctx.app.limiter.hit(f'register|{ctx.ip}', 3600)
    pw_hash = hash_password(password)
    now = now_ms()
    with ctx.db.transaction() as c:
        if c.execute('SELECT 1 FROM users WHERE phone = ?', (key,)).fetchone():
            raise conflict('An account with this phone number already exists.', 'phone_taken')
        cur = c.execute(
            'INSERT INTO users(phone, phone_display, role, full_name, name, password_hash, location, company, fpo, language, profile_json, created_at, last_login_at)'
            ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (key, str(b['phone']).strip()[:20], role, full_name, full_name.split(' ')[0], pw_hash, location, company, fpo, language,
             json.dumps({**profile, 'memberSince': date.today().strftime('%b %Y')}), now, now))
        uid = cur.lastrowid
    ctx.user = _user_by_id(ctx, uid)
    audit(ctx, 'register', 'user', str(uid), uid)
    token, exp = _issue_token(ctx, uid)
    return 201, {'token': token, 'expiresAt': iso(exp), 'user': user_public(ctx.user)}


@route('POST', '/api/auth/login', auth='none')
def login(ctx):
    b = ctx.body()
    phone, password = b.get('phone'), b.get('password')
    if not isinstance(phone, str) or not isinstance(password, str) or not phone or not password:
        raise bad('Phone and password are required.')
    key = phone_key(phone)
    bucket = f'login|{ctx.ip}|{key}'
    wait = ctx.app.limiter.blocked_for(bucket, ctx.cfg.login_attempts, ctx.cfg.login_window_s)
    if wait:
        raise ApiError(429, 'rate_limited', 'Too many failed attempts. Please wait before trying again.', headers={'Retry-After': str(wait)})
    row = ctx.db.one('SELECT * FROM users WHERE phone = ?', (key,))
    # Verify against a dummy hash when the user is unknown so response time doesn't reveal which numbers exist.
    ok = verify_password(password, row['password_hash'] if row else ctx.app.dummy_hash)
    if not row or not ok:
        ctx.app.limiter.hit(bucket, ctx.cfg.login_window_s)
        raise ApiError(401, 'invalid_credentials', 'Incorrect phone number or password.')
    if b.get('role') in ROLES and b['role'] != row['role']:
        raise ApiError(403, 'role_mismatch', f"This number is registered as a {row['role']}.", {'role': row['role']})
    ctx.app.limiter.clear(bucket)
    ctx.db.conn().execute('UPDATE users SET last_login_at = ? WHERE id = ?', (now_ms(), row['id']))
    ctx.user = row
    audit(ctx, 'login', 'user', str(row['id']))
    token, exp = _issue_token(ctx, row['id'])
    return {'token': token, 'expiresAt': iso(exp), 'user': user_public(row)}


@route('POST', '/api/auth/logout')
def logout(ctx):
    ctx.db.conn().execute('UPDATE sessions SET revoked = 1 WHERE id = ?', (ctx.session_id,))
    return {'ok': True}


@route('POST', '/api/auth/logout-all')
def logout_all(ctx):
    ctx.db.conn().execute('UPDATE sessions SET revoked = 1 WHERE user_id = ?', (ctx.user['id'],))
    return {'ok': True}


@route('GET', '/api/auth/me')
def me(ctx):
    return {'user': user_public(ctx.user)}


@route('PATCH', '/api/me')
def update_profile(ctx):
    b = ctx.body()
    sets, args = [], []
    if 'fullName' in b:
        full = text(b['fullName'], 'Full name', min_len=2, max_len=60)
        sets += ['full_name = ?', 'name = ?']
        args += [full, full.split(' ')[0]]
    if 'location' in b:
        sets.append('location = ?'); args.append(text(b['location'], 'Location', max_len=80, required=False))
    if 'company' in b and ctx.user['role'] == 'buyer':
        sets.append('company = ?'); args.append(text(b['company'], 'Company', max_len=80, required=False) or None)
    if 'fpo' in b and ctx.user['role'] != 'buyer':
        sets.append('fpo = ?'); args.append(text(b['fpo'], 'FPO', max_len=80, required=False) or None)
    if 'language' in b:
        if b['language'] not in LANGUAGES:
            raise bad('Unsupported language.')
        sets.append('language = ?'); args.append(b['language'])
    profile = loads(ctx.user['profile_json'], {})
    if 'weather' in b and isinstance(b['weather'], (int, float)) and not isinstance(b['weather'], bool):
        profile['weather'] = b['weather']
        sets.append('profile_json = ?'); args.append(json.dumps(profile))
    if 'designation' in b and ctx.user['role'] == 'fpo_operator':
        profile['designation'] = text(b['designation'], 'Designation', max_len=60, required=False)
        if 'profile_json = ?' in sets:
            args[sets.index('profile_json = ?')] = json.dumps(profile)
        else:
            sets.append('profile_json = ?'); args.append(json.dumps(profile))
    if sets:
        ctx.db.conn().execute(f'UPDATE users SET {", ".join(sets)} WHERE id = ?', (*args, ctx.user['id']))
    return {'user': user_public(_user_by_id(ctx, ctx.user['id']))}


@route('POST', '/api/me/password')
def change_password(ctx):
    b = ctx.body()
    current, new = b.get('currentPassword'), b.get('newPassword')
    if not isinstance(current, str) or not verify_password(current, ctx.user['password_hash']):
        raise ApiError(403, 'invalid_credentials', 'Current password is incorrect.')
    if not isinstance(new, str) or not 6 <= len(new) <= 128:
        raise bad('New password must be 6-128 characters.', 'invalid_password')
    c = ctx.db.conn()
    c.execute('UPDATE users SET password_hash = ? WHERE id = ?', (hash_password(new), ctx.user['id']))
    c.execute('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND id != ?', (ctx.user['id'], ctx.session_id))
    audit(ctx, 'password_change', 'user', str(ctx.user['id']))
    return {'ok': True}


@route('DELETE', '/api/me')
def delete_account(ctx):
    b = ctx.body()
    if not isinstance(b.get('password'), str) or not verify_password(b['password'], ctx.user['password_hash']):
        raise ApiError(403, 'invalid_credentials', 'Password is incorrect.')
    audit(ctx, 'account_delete', 'user', str(ctx.user['id']))
    ctx.db.conn().execute('DELETE FROM users WHERE id = ?', (ctx.user['id'],))
    return {'ok': True}


def _marketplace_rows(ctx):
    skip = {l['farmerLotId'] for l in catalogue()['availableLots'] if l.get('farmerLotId')}
    rows = ctx.db.all(
        "SELECT l.*, u.full_name AS owner_name, u.fpo AS owner_fpo FROM lots l JOIN users u ON u.id = l.user_id"
        " WHERE l.status NOT IN ('Sold','Payment Received','Offer Accepted') AND l.user_id != ? ORDER BY l.created_at DESC LIMIT 200",
        (ctx.user['id'],))
    return [r for r in rows if r['id'] not in skip]


def market_lot(row) -> dict:
    return {
        'id': row['id'], 'farmerLotId': row['id'], 'farmer': row['owner_name'], 'fpo': row['owner_fpo'], 'crop': row['crop'],
        'quantity': row['quantity'], 'unit': row['unit'], 'grade': row['grade'], 'location': row['location'],
        'distance': '—', 'askingPrice': row['asking_price'] or 0, 'harvestDate': row['harvest_date'], 'verified': True,
        'userPhoto': row['photo'],
    }


@route('GET', '/api/sync')
def sync(ctx):
    """Everything the client mirrors in its local store for the signed-in user."""
    uid, role, db = ctx.user['id'], ctx.user['role'], ctx.db
    lots = db.all('SELECT * FROM lots WHERE user_id = ? ORDER BY created_at DESC', (uid,)) if role == 'farmer' else []
    if role == 'buyer':
        offers = db.all('SELECT * FROM offers WHERE buyer_id = ? ORDER BY created_at DESC', (uid,))
        orders = db.all('SELECT * FROM orders WHERE buyer_id = ? ORDER BY created_at DESC', (uid,))
    elif role == 'farmer':
        offers = db.all('SELECT * FROM offers WHERE farmer_id = ? ORDER BY created_at DESC', (uid,))
        orders = db.all('SELECT * FROM orders WHERE farmer_id = ? ORDER BY created_at DESC', (uid,))
    else:
        offers, orders = [], []
    grievances = db.all('SELECT * FROM grievances WHERE user_id = ? ORDER BY created_at DESC', (uid,))
    pools = {p['id']: p for p in db.all('SELECT id, base_pooled_qty FROM pools')}
    pool_totals = {r['pool_id']: r['t'] for r in db.all('SELECT pool_id, SUM(qty) AS t FROM pool_contributions GROUP BY pool_id')}
    mine_pool = {r['pool_id']: r['qty'] for r in db.all('SELECT pool_id, qty FROM pool_contributions WHERE user_id = ?', (uid,))}
    trip_rows = db.all('SELECT id, base_booked_qtl FROM shared_trips')
    trip_totals = {r['trip_id']: r['t'] for r in db.all('SELECT trip_id, SUM(qty) AS t FROM trip_bookings GROUP BY trip_id')}
    mine_trip = {r['trip_id']: r for r in db.all('SELECT * FROM trip_bookings WHERE user_id = ?', (uid,))}
    unread = db.one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', (uid,))['n']
    accepted = [l for l in lots if l['accepted_option']]
    return {
        'user': user_public(ctx.user),
        'lots': [lot_dict(l) for l in lots],
        'lotStatus': {l['id']: l['status'] for l in lots},
        'acceptedOption': {l['id']: l['accepted_option'] for l in accepted},
        'offerAcceptedAt': {l['id']: l['accepted_at'] for l in accepted if l['accepted_at']},
        'offers': [offer_dict(o) for o in offers],
        'orders': [order_dict(o) for o in orders],
        'grievances': [grievance_dict(db, g) for g in grievances],
        'poolContributions': mine_pool,
        'poolOthers': {pid: p['base_pooled_qty'] + pool_totals.get(pid, 0) - mine_pool.get(pid, 0) for pid, p in pools.items()},
        'sharedTripBookings': {tid: {'qty': r['qty'], 'perQtl': r['per_qtl'], 'myCost': r['my_cost'], 'at': r['created_at']} for tid, r in mine_trip.items()},
        'tripOthers': {t['id']: t['base_booked_qtl'] + trip_totals.get(t['id'], 0) - (mine_trip[t['id']]['qty'] if t['id'] in mine_trip else 0) for t in trip_rows},
        'bookings': [{'type': b['type'], 'name': b['name'], 'date': b['created_at']} for b in db.all('SELECT * FROM bookings WHERE user_id = ? ORDER BY id', (uid,))],
        'marketLots': [market_lot(r) for r in _marketplace_rows(ctx)] if role != 'farmer' else [],
        'unreadNotifications': unread,
        'serverTime': now_ms(),
    }
