"""Marketplace: lots, offers/bids and orders."""
from .core import audit, lot_dict, notify, offer_dict, order_dict, route, require_role
from .routes_auth import market_lot
from .seed import catalogue
from .util import ApiError, bad, client_id, conflict, display_date, forbidden, new_id, not_found, now_ms, number, text

GRADES = ('Premium Quality', 'Grade A', 'Grade B')
LOT_STATUSES = ('Recommendation Ready', 'Offer Accepted', 'Pending Pickup', 'Payment Received', 'Sold')
CLOSED_STATUSES = ('Offer Accepted', 'Pending Pickup', 'Payment Received', 'Sold')
CANCEL_WINDOW_MS = 24 * 3600 * 1000
MAX_QTY = 100_000
MAX_PHOTO_CHARS = 450_000   # base64 data URL; the client downsizes to ~800px JPEG before upload


def _crops():
    return {c['name'] for c in catalogue()['commodities']}


def _own_lot(ctx, lot_id, conn):
    row = conn.execute('SELECT * FROM lots WHERE id = ?', (lot_id,)).fetchone()
    if not row or row['user_id'] != ctx.user['id']:
        raise not_found('Lot')
    return row


def _unique_id(conn, table, prefix, wanted):
    if wanted:
        if conn.execute(f'SELECT 1 FROM {table} WHERE id = ?', (wanted,)).fetchone():
            raise conflict(f'{wanted} already exists.', 'id_taken')
        return wanted
    for _ in range(50):
        candidate = new_id(prefix)
        if not conn.execute(f'SELECT 1 FROM {table} WHERE id = ?', (candidate,)).fetchone():
            return candidate
    raise ApiError(500, 'id_exhausted', 'Could not allocate an id.')


# ------------------------------------------------------------------ lots

def _parse_lot_fields(b, *, partial=False):
    out = {}
    if not partial or 'crop' in b:
        crop = text(b.get('crop'), 'Crop', min_len=1, max_len=40)
        if crop not in _crops():
            raise bad('Unknown crop.', 'invalid_crop')
        out['crop'] = crop
    if not partial or 'quantity' in b:
        out['quantity'] = number(b.get('quantity'), 'Quantity', minimum=1, maximum=MAX_QTY)
    if not partial or 'grade' in b:
        if b.get('grade') not in GRADES:
            raise bad('grade must be one of: ' + ', '.join(GRADES))
        out['grade'] = b['grade']
    if 'harvestDate' in b:
        out['harvest_date'] = text(b['harvestDate'], 'Harvest date', max_len=30, required=False) or 'Not set'
    if 'location' in b:
        out['location'] = text(b['location'], 'Location', max_len=80, required=False)
    if 'askingPrice' in b and b['askingPrice'] not in (None, ''):
        out['asking_price'] = number(b['askingPrice'], 'Asking price', minimum=1, maximum=1_000_000)
    if 'photo' in b and b['photo']:
        photo = b['photo']
        if not isinstance(photo, str) or not photo.startswith('data:image/') or len(photo) > MAX_PHOTO_CHARS:
            raise bad('photo must be an image data URL under ~450 KB.', 'invalid_photo')
        out['photo'] = photo
    return out


@route('GET', '/api/lots', roles=('farmer',))
def list_lots(ctx):
    rows = ctx.db.all('SELECT * FROM lots WHERE user_id = ? ORDER BY created_at DESC', (ctx.user['id'],))
    return {'lots': [lot_dict(r) for r in rows]}


@route('POST', '/api/lots', roles=('farmer',))
def create_lot(ctx):
    b = ctx.body()
    f = _parse_lot_fields(b)
    wanted = client_id(b.get('id'), 'LOT')
    now = now_ms()
    with ctx.db.transaction() as c:
        lot_id = _unique_id(c, 'lots', 'LOT', wanted)
        c.execute(
            'INSERT INTO lots(id, user_id, crop, quantity, unit, grade, harvest_date, location, asking_price, photo, created_at, updated_at)'
            " VALUES (?,?,?,?, 'Quintals', ?,?,?,?,?,?,?)",
            (lot_id, ctx.user['id'], f['crop'], f['quantity'], f['grade'], f.get('harvest_date', 'Not set'),
             f.get('location') or ctx.user['location'], f.get('asking_price'), f.get('photo'), now, now))
    audit(ctx, 'lot_create', 'lot', lot_id)
    return 201, {'lot': lot_dict(ctx.db.one('SELECT * FROM lots WHERE id = ?', (lot_id,)))}


@route('GET', '/api/lots/<lot_id>')
def get_lot(ctx):
    row = ctx.db.one('SELECT l.*, u.full_name AS owner_name, u.fpo AS owner_fpo FROM lots l JOIN users u ON u.id = l.user_id WHERE l.id = ?', (ctx.params['lot_id'],))
    if not row:
        raise not_found('Lot')
    if row['user_id'] != ctx.user['id'] and row['status'] in CLOSED_STATUSES:
        raise not_found('Lot')
    return {'lot': lot_dict(row, owner={'full_name': row['owner_name'], 'fpo': row['owner_fpo']})}


@route('PATCH', '/api/lots/<lot_id>', roles=('farmer',))
def update_lot(ctx):
    with ctx.db.transaction() as c:
        lot = _own_lot(ctx, ctx.params['lot_id'], c)
        if lot['status'] in ('Sold', 'Payment Received'):
            raise conflict('A completed lot cannot be edited.', 'lot_closed')
        f = _parse_lot_fields(ctx.body(), partial=True)
        if not f:
            raise bad('Nothing to update.')
        if lot['status'] == 'Offer Accepted' and ('quantity' in f or 'crop' in f):
            raise conflict('Quantity and crop cannot change while an offer is accepted.', 'lot_locked')
        f['updated_at'] = now_ms()
        c.execute(f"UPDATE lots SET {', '.join(k + ' = ?' for k in f)} WHERE id = ?", (*f.values(), lot['id']))
    return {'lot': lot_dict(ctx.db.one('SELECT * FROM lots WHERE id = ?', (ctx.params['lot_id'],)))}


@route('DELETE', '/api/lots/<lot_id>', roles=('farmer',))
def delete_lot(ctx):
    with ctx.db.transaction() as c:
        lot = _own_lot(ctx, ctx.params['lot_id'], c)
        if lot['status'] in ('Offer Accepted', 'Pending Pickup'):
            raise conflict('Cancel the accepted offer before deleting this lot.', 'lot_locked')
        c.execute('DELETE FROM lots WHERE id = ?', (lot['id'],))
    audit(ctx, 'lot_delete', 'lot', ctx.params['lot_id'])
    return {'ok': True}


@route('GET', '/api/market/lots')
def market_lots(ctx):
    from .routes_auth import _marketplace_rows
    rows = _marketplace_rows(ctx)
    crop, q = ctx.q('crop'), (ctx.q('q') or '').strip().lower()
    if crop:
        rows = [r for r in rows if r['crop'] == crop]
    if q:
        rows = [r for r in rows if q in r['crop'].lower() or q in r['owner_name'].lower() or q in (r['location'] or '').lower()]
    limit, offset = ctx.q_int('limit', 50, 1, 100), ctx.q_int('offset', 0, 0, 10_000)
    return {'lots': [market_lot(r) for r in rows[offset:offset + limit]], 'total': len(rows)}


# ------------------------------------------------------------------ offers / bids

@route('POST', '/api/offers', roles=('buyer',))
def create_offer(ctx):
    b = ctx.body()
    price = number(b.get('price'), 'Price', minimum=1, maximum=1_000_000)
    qty = number(b.get('quantity'), 'Quantity', minimum=1, maximum=MAX_QTY)
    listing_id = text(b.get('lotId'), 'lotId', min_len=3, max_len=24)
    farmer_lot_id = b.get('farmerLotId') or (listing_id if listing_id.startswith('LOT-') else None)
    wanted = client_id(b.get('id'), 'OFR')
    now = now_ms()
    with ctx.db.transaction() as c:
        lot = c.execute('SELECT l.*, u.full_name AS owner_name FROM lots l JOIN users u ON u.id = l.user_id WHERE l.id = ?', (farmer_lot_id,)).fetchone() if farmer_lot_id else None
        static = next((l for l in catalogue()['availableLots'] if l['id'] == listing_id), None)
        if lot:
            if lot['user_id'] == ctx.user['id']:
                raise forbidden('You cannot bid on your own lot.')
            if lot['status'] in CLOSED_STATUSES:
                raise conflict('This lot is no longer open for offers.', 'lot_closed')
            if qty > lot['quantity']:
                raise bad(f"Quantity cannot exceed the {lot['quantity']:g} quintals on offer.")
            crop, unit, farmer_name, farmer_id, lot_id = lot['crop'], lot['unit'], lot['owner_name'], lot['user_id'], lot['id']
        elif static:
            if qty > static['quantity']:
                raise bad(f"Quantity cannot exceed the {static['quantity']:g} quintals on offer.")
            crop, unit, farmer_name, farmer_id, lot_id = static['crop'], static['unit'], static['farmer'], None, None
        else:
            raise not_found('Lot')
        dup = c.execute("SELECT 1 FROM offers WHERE buyer_id = ? AND listing_id = ? AND status = 'Pending'", (ctx.user['id'], listing_id)).fetchone()
        if dup:
            raise conflict('You already have a pending offer on this lot. Withdraw it first.', 'duplicate_offer')
        offer_id = _unique_id(c, 'offers', 'OFR', wanted)
        buyer_name = ctx.user['company'] or ctx.user['full_name']
        buyer_ref = next((x['id'] for x in catalogue()['buyers'] if x['name'] == buyer_name), None)
        c.execute(
            'INSERT INTO offers(id, lot_id, static_lot_ref, listing_id, buyer_id, farmer_id, buyer_name, buyer_ref, farmer_name, crop, quantity, unit, price, amount, created_at, updated_at)'
            ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (offer_id, lot_id, None if lot else listing_id, listing_id, ctx.user['id'], farmer_id, buyer_name, buyer_ref, farmer_name, crop, qty, unit, price, price * qty, now, now))
        notify(c, farmer_id, 'offer', f'New bid on your {crop} lot', f'{buyer_name} bid ₹{price:g}/qtl for {qty:g} qtl.', f'#/lots/{lot_id}')
    audit(ctx, 'offer_create', 'offer', offer_id)
    return 201, {'offer': offer_dict(ctx.db.one('SELECT * FROM offers WHERE id = ?', (offer_id,)))}


@route('GET', '/api/offers', roles=('buyer', 'farmer'))
def list_offers(ctx):
    col = 'buyer_id' if ctx.user['role'] == 'buyer' else 'farmer_id'
    rows = ctx.db.all(f'SELECT * FROM offers WHERE {col} = ? ORDER BY created_at DESC LIMIT 200', (ctx.user['id'],))
    return {'offers': [offer_dict(r) for r in rows]}


@route('POST', '/api/offers/<offer_id>/withdraw', roles=('buyer',))
def withdraw_offer(ctx):
    with ctx.db.transaction() as c:
        o = c.execute('SELECT * FROM offers WHERE id = ? AND buyer_id = ?', (ctx.params['offer_id'], ctx.user['id'])).fetchone()
        if not o:
            raise not_found('Offer')
        if o['status'] != 'Pending':
            raise conflict(f"A {o['status'].lower()} offer cannot be withdrawn.", 'offer_closed')
        c.execute("UPDATE offers SET status = 'Withdrawn', updated_at = ? WHERE id = ?", (now_ms(), o['id']))
    return {'offer': offer_dict(ctx.db.one('SELECT * FROM offers WHERE id = ?', (ctx.params['offer_id'],)))}


@route('POST', '/api/offers/<offer_id>/decline', roles=('farmer',))
def decline_offer(ctx):
    with ctx.db.transaction() as c:
        o = c.execute('SELECT * FROM offers WHERE id = ? AND farmer_id = ?', (ctx.params['offer_id'], ctx.user['id'])).fetchone()
        if not o:
            raise not_found('Offer')
        if o['status'] != 'Pending':
            raise conflict(f"A {o['status'].lower()} offer cannot be declined.", 'offer_closed')
        c.execute("UPDATE offers SET status = 'Declined', updated_at = ? WHERE id = ?", (now_ms(), o['id']))
        notify(c, o['buyer_id'], 'offer', f"Your bid on {o['crop']} was declined", f"{o['farmer_name']} declined your bid.", '#/offers')
    return {'offer': offer_dict(ctx.db.one('SELECT * FROM offers WHERE id = ?', (ctx.params['offer_id'],)))}


# ------------------------------------------------------------------ accepting an option / bid -> order

@route('POST', '/api/lots/<lot_id>/accept', roles=('farmer',))
def accept_option(ctx):
    """Farmer accepts one of the options on a lot: a real buyer bid (offerId) or a computed option
    (mandi / FPO lot). Creates the order and locks the lot, atomically."""
    b = ctx.body()
    option_id = text(b.get('optionId'), 'optionId', min_len=1, max_len=60)
    wanted_order = client_id(b.get('orderId'), 'ORD')
    now = now_ms()
    with ctx.db.transaction() as c:
        lot = _own_lot(ctx, ctx.params['lot_id'], c)
        if lot['status'] in CLOSED_STATUSES:
            raise conflict('An offer has already been accepted for this lot.', 'lot_closed')
        offer = None
        if b.get('offerId'):
            offer = c.execute("SELECT * FROM offers WHERE id = ? AND lot_id = ? AND status = 'Pending'", (b['offerId'], lot['id'])).fetchone()
            if not offer:
                raise not_found('Pending offer')
            buyer_name, rate, qty, buyer_id = offer['buyer_name'], offer['price'], min(offer['quantity'], lot['quantity']), offer['buyer_id']
        else:
            buyer_name = text(b.get('buyer'), 'Buyer', min_len=1, max_len=80)
            rate = number(b.get('rate'), 'Rate', minimum=1, maximum=1_000_000)
            qty, buyer_id = lot['quantity'], None
        order_id = _unique_id(c, 'orders', 'ORD', wanted_order)
        c.execute(
            'INSERT INTO orders(id, lot_id, farmer_id, buyer_id, offer_id, crop, quantity, unit, buyer_name, rate, amount, stage, created_at, updated_at)'
            ' VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?)',
            (order_id, lot['id'], ctx.user['id'], buyer_id, offer['id'] if offer else None, lot['crop'], qty, lot['unit'], buyer_name, rate, rate * qty, now, now))
        c.execute('INSERT INTO order_events(order_id, stage, at, user_id) VALUES (?,0,?,?)', (order_id, now, ctx.user['id']))
        c.execute("UPDATE lots SET status = 'Offer Accepted', accepted_option = ?, accepted_at = ?, updated_at = ? WHERE id = ?", (option_id, now, now, lot['id']))
        if offer:
            c.execute("UPDATE offers SET status = 'Accepted', updated_at = ? WHERE id = ?", (now, offer['id']))
            losers = c.execute("SELECT id, buyer_id FROM offers WHERE lot_id = ? AND status = 'Pending' AND id != ?", (lot['id'], offer['id'])).fetchall()
            c.execute("UPDATE offers SET status = 'Declined', updated_at = ? WHERE lot_id = ? AND status = 'Pending'", (now, lot['id']))
            notify(c, offer['buyer_id'], 'offer', f"Your bid on {lot['crop']} was accepted!", f'Order {order_id} is ready for pickup.', '#/offers')
            for loser in losers:
                notify(c, loser['buyer_id'], 'offer', f"Another buyer won the {lot['crop']} lot", 'Your bid was not selected.', '#/offers')
    audit(ctx, 'offer_accept', 'order', order_id)
    return 201, {'order': order_dict(ctx.db.one('SELECT * FROM orders WHERE id = ?', (order_id,))),
                 'lot': lot_dict(ctx.db.one('SELECT * FROM lots WHERE id = ?', (ctx.params['lot_id'],))), 'acceptedAt': now}


@route('POST', '/api/lots/<lot_id>/cancel-accept', roles=('farmer',))
def cancel_accept(ctx):
    """24-hour cooling-off: undo an acceptance before pickup."""
    b = ctx.body() if ctx.raw_body else {}
    revert = b.get('revertStatus') if b.get('revertStatus') in LOT_STATUSES else 'Recommendation Ready'
    if revert in CLOSED_STATUSES:
        revert = 'Recommendation Ready'
    with ctx.db.transaction() as c:
        lot = _own_lot(ctx, ctx.params['lot_id'], c)
        if lot['status'] != 'Offer Accepted' or not lot['accepted_at']:
            raise conflict('There is no accepted offer to cancel on this lot.', 'nothing_to_cancel')
        if now_ms() - lot['accepted_at'] > CANCEL_WINDOW_MS:
            raise conflict('The 24-hour cancellation window has passed.', 'window_closed')
        order = c.execute('SELECT * FROM orders WHERE lot_id = ? ORDER BY created_at DESC LIMIT 1', (lot['id'],)).fetchone()
        if order and order['stage'] > 0:
            raise conflict('Pickup has already started, so this order can no longer be cancelled.', 'pickup_started')
        if order:
            c.execute('DELETE FROM orders WHERE id = ?', (order['id'],))
            if order['offer_id']:
                c.execute("UPDATE offers SET status = 'Pending', updated_at = ? WHERE id = ?", (now_ms(), order['offer_id']))
                notify(c, order['buyer_id'], 'offer', f"{lot['crop']} order cancelled", 'The farmer cancelled within the 24-hour window; your bid is open again.', '#/offers')
        c.execute('UPDATE lots SET status = ?, accepted_option = NULL, accepted_at = NULL, updated_at = ? WHERE id = ?', (revert, now_ms(), lot['id']))
    audit(ctx, 'offer_cancel', 'lot', ctx.params['lot_id'])
    return {'lot': lot_dict(ctx.db.one('SELECT * FROM lots WHERE id = ?', (ctx.params['lot_id'],)))}


# ------------------------------------------------------------------ orders

def _order_for_party(ctx, order_id, conn=None):
    sql = 'SELECT * FROM orders WHERE id = ? AND (farmer_id = ? OR buyer_id = ?)'
    args = (order_id, ctx.user['id'], ctx.user['id'])
    row = conn.execute(sql, args).fetchone() if conn else ctx.db.one(sql, args)
    if not row:
        raise not_found('Order')
    return row


@route('GET', '/api/orders', roles=('farmer', 'buyer'))
def list_orders(ctx):
    col = 'farmer_id' if ctx.user['role'] == 'farmer' else 'buyer_id'
    rows = ctx.db.all(f'SELECT * FROM orders WHERE {col} = ? ORDER BY created_at DESC LIMIT 200', (ctx.user['id'],))
    return {'orders': [order_dict(r) for r in rows]}


@route('GET', '/api/orders/<order_id>', roles=('farmer', 'buyer'))
def get_order(ctx):
    o = _order_for_party(ctx, ctx.params['order_id'])
    events = ctx.db.all('SELECT stage, at FROM order_events WHERE order_id = ? ORDER BY id', (o['id'],))
    stages = catalogue()['orderStages']
    return {'order': order_dict(o), 'events': [{'stage': stages[e['stage']], 'at': e['at']} for e in events]}


@route('POST', '/api/orders/<order_id>/stage', roles=('farmer', 'buyer'))
def advance_order(ctx):
    stages = catalogue()['orderStages']
    target = number(ctx.body().get('stage'), 'stage', minimum=1, maximum=len(stages) - 1, integer=True)
    now = now_ms()
    with ctx.db.transaction() as c:
        o = _order_for_party(ctx, ctx.params['order_id'], c)
        if target != o['stage'] + 1:
            raise conflict(f"Order is at '{stages[o['stage']]}'; the next step is '{stages[min(o['stage'] + 1, len(stages) - 1)]}'.", 'invalid_stage')
        c.execute('UPDATE orders SET stage = ?, updated_at = ? WHERE id = ?', (target, now, o['id']))
        c.execute('INSERT INTO order_events(order_id, stage, at, user_id) VALUES (?,?,?,?)', (o['id'], target, now, ctx.user['id']))
        if target == len(stages) - 1:
            c.execute("UPDATE lots SET status = 'Payment Received', updated_at = ? WHERE id = ?", (now, o['lot_id']))
        other = o['buyer_id'] if ctx.user['id'] == o['farmer_id'] else o['farmer_id']
        notify(c, other, 'order', f"Order {o['id']}: {stages[target]}", f"{o['crop']} · {o['quantity']:g} qtl", '#/orders' if other == o['farmer_id'] else '#/offers')
    return {'order': order_dict(ctx.db.one('SELECT * FROM orders WHERE id = ?', (ctx.params['order_id'],)))}
