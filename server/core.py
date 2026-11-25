"""Routing, request context, auth helpers and row serialisers shared by every route module."""
import hmac
import re
from dataclasses import dataclass, field

from .db import loads
from .events import queue_event
from .util import ApiError, bad, display_date, iso, now_ms


@dataclass
class Ctx:
    app: object
    method: str
    path: str
    query: dict
    headers: dict
    ip: str
    raw_body: bytes = b''
    params: dict = field(default_factory=dict)
    user: object = None          # sqlite Row of the authenticated user
    session_id: str = ''
    _json: object = None

    @property
    def db(self):
        return self.app.db

    @property
    def cfg(self):
        return self.app.cfg

    def body(self) -> dict:
        if self._json is None:
            if not self.raw_body:
                raise bad('A JSON body is required.')
            import json
            try:
                self._json = json.loads(self.raw_body)
            except ValueError:
                raise bad('Request body is not valid JSON.', 'invalid_json')
        if not isinstance(self._json, dict):
            raise bad('Request body must be a JSON object.')
        return self._json

    def q(self, name, default=None):
        vals = self.query.get(name)
        return vals[0] if vals else default

    def q_int(self, name, default, lo, hi):
        try:
            return max(lo, min(hi, int(self.q(name, default))))
        except (TypeError, ValueError):
            return default


class Router:
    def __init__(self):
        self.routes = []

    def add(self, method, pattern, fn, auth, roles):
        regex = re.compile('^' + re.sub(r'<(\w+)>', r'(?P<\1>[^/]+)', pattern) + '$')
        self.routes.append((method, regex, fn, auth, roles))

    def match(self, method, path):
        """Returns (route, params), or (None, allowed_methods) when only the method is wrong."""
        allowed = []
        for m, regex, fn, auth, roles in self.routes:
            hit = regex.match(path)
            if not hit:
                continue
            if m == method:
                return (fn, auth, roles), hit.groupdict()
            allowed.append(m)
        return None, allowed


ROUTER = Router()


def route(method, pattern, auth='user', roles=None):
    """auth: 'none' | 'user' (valid session) | 'admin' (X-Admin-Key). roles restricts 'user' routes."""
    def deco(fn):
        ROUTER.add(method, pattern, fn, auth, roles)
        return fn
    return deco


def admin_ok(ctx: Ctx) -> bool:
    key = ctx.cfg.admin_key
    given = ctx.headers.get('x-admin-key', '')
    return bool(key) and hmac.compare_digest(key.encode(), given.encode())


def audit(ctx: Ctx, action, entity=None, entity_id=None, user_id=None):
    uid = user_id if user_id is not None else (ctx.user['id'] if ctx.user else None)
    ctx.db.conn().execute('INSERT INTO audit_log(at, user_id, action, entity, entity_id, ip) VALUES (?,?,?,?,?,?)',
                          (now_ms(), uid, action, entity, entity_id, ctx.ip))


def notify(conn, user_id, kind, title, body='', link=''):
    if user_id:
        conn.execute('INSERT INTO notifications(user_id, kind, title, body, link, created_at) VALUES (?,?,?,?,?,?)',
                     (user_id, kind, title, body, link, now_ms()))
        # Delivered live over SSE once the request's transaction has committed (see events.py).
        queue_event('notification', {'kind': kind, 'title': title, 'body': body, 'link': link}, user_id=user_id)


def require_role(ctx: Ctx, *roles):
    if ctx.user['role'] not in roles:
        raise ApiError(403, 'forbidden', f"This action is only available to: {', '.join(roles)}.")


# ---- serialisers: shaped like the objects the front end already uses ----

def user_public(row) -> dict:
    out = {
        'id': row['id'], 'role': row['role'], 'name': row['name'], 'fullName': row['full_name'],
        'phone': row['phone_display'], 'location': row['location'], 'language': row['language'],
    }
    if row['company']:
        out['company'] = row['company']
    if row['fpo']:
        out['fpo'] = row['fpo']
    out.update(loads(row['profile_json'], {}))
    return out


def lot_dict(row, owner=None) -> dict:
    out = {
        'id': row['id'], 'crop': row['crop'], 'quantity': row['quantity'], 'unit': row['unit'], 'grade': row['grade'],
        'harvestDate': row['harvest_date'], 'location': row['location'], 'status': row['status'],
    }
    if row['asking_price']:
        out['askingPrice'] = row['asking_price']
    if row['photo']:
        out['userPhoto'] = row['photo']
    if owner is not None:
        out['farmer'] = owner['full_name']
        out['fpo'] = owner['fpo']
    return out


def offer_dict(row) -> dict:
    return {
        'id': row['id'], 'lotId': row['listing_id'] or row['lot_id'] or row['static_lot_ref'], 'farmerLotId': row['lot_id'],
        'crop': row['crop'], 'farmer': row['farmer_name'], 'quantity': row['quantity'], 'unit': row['unit'],
        'price': row['price'], 'amount': row['amount'], 'status': row['status'], 'date': display_date(row['created_at']),
        'buyer': row['buyer_name'], 'buyerId': row['buyer_ref'],
    }


def order_dict(row) -> dict:
    return {
        'id': row['id'], 'lotId': row['lot_id'], 'crop': row['crop'], 'quantity': row['quantity'], 'unit': row['unit'],
        'buyer': row['buyer_name'], 'rate': row['rate'], 'amount': row['amount'], 'stage': row['stage'],
        'date': display_date(row['created_at']),
    }


def grievance_dict(db, row) -> dict:
    events = db.all('SELECT status, at FROM grievance_events WHERE grievance_id = ? ORDER BY id', (row['id'],))
    return {
        'id': row['id'], 'type': row['type'], 'description': row['description'], 'ref': row['ref'], 'status': row['status'],
        'createdAt': iso(row['created_at']), 'history': [{'status': e['status'], 'at': iso(e['at'])} for e in events],
    }
