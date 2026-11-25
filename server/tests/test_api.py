import time
import unittest

from server.tests.helpers import ApiTestCase


class HealthAndStatic(ApiTestCase):
    def test_health_and_catalog(self):
        self.assertEqual(self.ok('GET', '/api/health')['status'], 'ok')
        cat = self.ok('GET', '/api/catalog')
        self.assertTrue(cat['commodities'] and cat['orderStages'][0] == 'Offer Accepted')

    def test_unknown_route_and_method(self):
        self.err('GET', '/api/nope', status=404, code='not_found')
        s, data, h = self.call('DELETE', '/api/health')
        self.assertEqual(s, 405)
        self.assertIn('GET', h['Allow'])

    def test_static_files_served_but_server_code_is_not(self):
        s, body, h = self.call('GET', '/')
        self.assertEqual(s, 200)
        self.assertIn(b'Kisan Mitra', body)
        self.assertIn('X-Content-Type-Options', h)
        for path in ['/server/app.py', '/devserver.py', '/data/kisanmitra.db', '/.git/config', '/js/../server/seed.json', '/%2e%2e/server/app.py', '/package.json', '/tests/util.test.js']:
            self.assertEqual(self.call('GET', path)[0], 404, path)
        self.assertEqual(self.call('GET', '/js/app.js')[0], 200)

    def test_rejects_bad_bodies(self):
        self.assertEqual(self.call('POST', '/api/auth/login', raw=b'{not json')[0], 400)
        self.assertEqual(self.call('POST', '/api/auth/login', raw=b'[1,2]')[0], 400)
        try:
            s, _, _ = self.call('POST', '/api/auth/login', raw=b'x' * (3 * 1024 * 1024))
            self.assertEqual(s, 413)
        except OSError:
            pass   # the server may drop the connection before the client finishes sending; both are a refusal


class Auth(ApiTestCase):
    def test_register_login_me_logout(self):
        token, user, body = self.register('farmer')
        self.assertEqual(user['role'], 'farmer')
        self.assertNotIn('password', user)
        self.assertEqual(self.ok('GET', '/api/auth/me', token=token)['user']['fullName'], body['fullName'])
        login = self.ok('POST', '/api/auth/login', {'phone': body['phone'], 'password': 'secret1', 'role': 'farmer'})
        self.ok('POST', '/api/auth/logout', token=login['token'])
        self.err('GET', '/api/auth/me', token=login['token'], status=401, code='invalid_token')
        self.ok('GET', '/api/auth/me', token=token)   # other session unaffected

    def test_register_validation(self):
        base = {'role': 'farmer', 'fullName': 'Asha Rao', 'phone': '9000011111', 'password': 'secret1'}
        self.err('POST', '/api/auth/register', {**base, 'role': 'admin'})
        self.err('POST', '/api/auth/register', {**base, 'phone': '1234567890'}, code='invalid_phone')
        self.err('POST', '/api/auth/register', {**base, 'password': '123'}, code='invalid_password')
        self.err('POST', '/api/auth/register', {**base, 'fullName': 'A'})
        self.err('POST', '/api/auth/register', {**base, 'fullName': 'x' * 61})

    def test_duplicate_phone_in_any_format(self):
        _, _, body = self.register('buyer')
        self.err('POST', '/api/auth/register', {**body, 'phone': '+91 ' + body['phone']}, status=409, code='phone_taken')

    def test_wrong_password_and_unknown_user_look_identical(self):
        _, _, body = self.register('farmer')
        a = self.err('POST', '/api/auth/login', {'phone': body['phone'], 'password': 'wrong-pass'}, status=401)
        b = self.err('POST', '/api/auth/login', {'phone': '9999999999', 'password': 'wrong-pass'}, status=401)
        self.assertEqual(a['error']['message'], b['error']['message'])

    def test_role_mismatch_reported_only_with_correct_password(self):
        _, _, body = self.register('buyer')
        d = self.err('POST', '/api/auth/login', {'phone': body['phone'], 'password': 'secret1', 'role': 'farmer'}, status=403, code='role_mismatch')
        self.assertEqual(d['error']['details']['role'], 'buyer')
        self.err('POST', '/api/auth/login', {'phone': body['phone'], 'password': 'bad-pass', 'role': 'farmer'}, status=401)

    def test_login_rate_limit_then_recovery_is_blocked(self):
        _, _, body = self.register('farmer')
        for _ in range(5):
            self.err('POST', '/api/auth/login', {'phone': body['phone'], 'password': 'nope-nope'}, status=401)
        s, d, h = self.call('POST', '/api/auth/login', {'phone': body['phone'], 'password': 'secret1'})
        self.assertEqual(s, 429)
        self.assertIn('Retry-After', h)

    def test_tampered_or_missing_token(self):
        token, _, _ = self.register('farmer')
        self.err('GET', '/api/auth/me', status=401, code='unauthenticated')
        self.err('GET', '/api/auth/me', token=token[:-3] + 'abc', status=401)
        self.err('GET', '/api/auth/me', token='garbage', status=401)

    def test_profile_update_and_password_change(self):
        token, _, body = self.register('buyer', company='Old Co')
        u = self.ok('PATCH', '/api/me', {'fullName': 'New Name', 'company': 'New Co', 'location': 'Pune', 'language': 'हिंदी'}, token)['user']
        self.assertEqual((u['fullName'], u['company'], u['name']), ('New Name', 'New Co', 'New'))
        self.err('PATCH', '/api/me', {'language': 'Klingon'}, token)
        self.err('POST', '/api/me/password', {'currentPassword': 'wrong', 'newPassword': 'newpass1'}, token, status=403)
        other = self.ok('POST', '/api/auth/login', {'phone': body['phone'], 'password': 'secret1'})['token']
        self.ok('POST', '/api/me/password', {'currentPassword': 'secret1', 'newPassword': 'newpass1'}, token)
        self.err('GET', '/api/auth/me', token=other, status=401)            # other sessions revoked
        self.ok('GET', '/api/auth/me', token=token)                          # current one kept
        self.err('POST', '/api/auth/login', {'phone': body['phone'], 'password': 'secret1'}, status=401)
        self.ok('POST', '/api/auth/login', {'phone': body['phone'], 'password': 'newpass1'})

    def test_delete_account_cascades(self):
        token, _, body = self.register('farmer')
        self.ok('POST', '/api/lots', {'crop': 'Tomato', 'quantity': 5, 'grade': 'Grade A'}, token, status=201)
        self.err('DELETE', '/api/me', {'password': 'wrong'}, token, status=403)
        self.ok('DELETE', '/api/me', {'password': 'secret1'}, token)
        self.err('GET', '/api/auth/me', token=token, status=401)
        self.err('POST', '/api/auth/login', {'phone': body['phone'], 'password': 'secret1'}, status=401)

    def test_demo_accounts_exist(self):
        for role in ('farmer', 'buyer', 'fpo_operator'):
            self.assertTrue(self.demo(role))


class Lots(ApiTestCase):
    def test_lot_crud_and_validation(self):
        token, _, _ = self.register('farmer')
        lot = self.ok('POST', '/api/lots', {'crop': 'Onion', 'quantity': 12, 'grade': 'Grade A', 'location': 'Pune'}, token, status=201)['lot']
        self.assertEqual((lot['crop'], lot['quantity'], lot['status']), ('Onion', 12, 'Recommendation Ready'))
        for bad in [{'crop': 'Moonrock', 'quantity': 5, 'grade': 'Grade A'}, {'crop': 'Onion', 'quantity': 0, 'grade': 'Grade A'},
                    {'crop': 'Onion', 'quantity': -3, 'grade': 'Grade A'}, {'crop': 'Onion', 'quantity': 'abc', 'grade': 'Grade A'},
                    {'crop': 'Onion', 'quantity': 10 ** 7, 'grade': 'Grade A'}, {'crop': 'Onion', 'quantity': 5, 'grade': 'Gold'},
                    {'crop': 'Onion', 'quantity': 5, 'grade': 'Grade A', 'photo': 'http://evil/x.png'}]:
            self.err('POST', '/api/lots', bad, token)
        up = self.ok('PATCH', f"/api/lots/{lot['id']}", {'quantity': 20, 'grade': 'Premium Quality'}, token)['lot']
        self.assertEqual((up['quantity'], up['grade']), (20, 'Premium Quality'))
        self.assertEqual(len(self.ok('GET', '/api/lots', token=token)['lots']), 1)
        self.ok('DELETE', f"/api/lots/{lot['id']}", token=token)
        self.err('GET', f"/api/lots/{lot['id']}", token=token, status=404)

    def test_client_supplied_id_and_collisions(self):
        token, _, _ = self.register('farmer')
        body = {'id': 'LOT-7771', 'crop': 'Wheat', 'quantity': 5, 'grade': 'Grade B'}
        self.assertEqual(self.ok('POST', '/api/lots', body, token, status=201)['lot']['id'], 'LOT-7771')
        self.err('POST', '/api/lots', body, token, status=409, code='id_taken')
        self.err('POST', '/api/lots', {**body, 'id': "x'; DROP TABLE lots;--"}, token)

    def test_only_farmers_create_and_only_owner_edits(self):
        buyer, _, _ = self.register('buyer')
        self.err('POST', '/api/lots', {'crop': 'Onion', 'quantity': 5, 'grade': 'Grade A'}, buyer, status=403)
        a, _, _ = self.register('farmer')
        b, _, _ = self.register('farmer')
        lot = self.ok('POST', '/api/lots', {'crop': 'Onion', 'quantity': 5, 'grade': 'Grade A'}, a, status=201)['lot']
        self.err('PATCH', f"/api/lots/{lot['id']}", {'quantity': 9}, b, status=404)
        self.err('DELETE', f"/api/lots/{lot['id']}", token=b, status=404)

    def test_marketplace_shows_other_farmers_open_lots_only(self):
        a, _, _ = self.register('farmer')
        lot = self.ok('POST', '/api/lots', {'crop': 'Cotton', 'quantity': 7, 'grade': 'Grade A', 'askingPrice': 6400}, a, status=201)['lot']
        buyer, _, _ = self.register('buyer')
        ids = [l['id'] for l in self.ok('GET', '/api/market/lots?crop=Cotton', token=buyer)['lots']]
        self.assertIn(lot['id'], ids)
        self.assertNotIn(lot['id'], [l['id'] for l in self.ok('GET', '/api/market/lots', token=a)['lots']])


class Trading(ApiTestCase):
    def setUp(self):
        self.farmer, self.fuser, _ = self.register('farmer')
        self.buyer, self.buser, _ = self.register('buyer', company='Test Traders')
        self.lot = self.ok('POST', '/api/lots', {'crop': 'Tomato', 'quantity': 30, 'grade': 'Premium Quality', 'askingPrice': 1600}, self.farmer, status=201)['lot']

    def bid(self, price=1650, qty=20, token=None, lot_id=None, **extra):
        lid = lot_id or self.lot['id']
        return self.ok('POST', '/api/offers', {'lotId': lid, 'farmerLotId': lid, 'price': price, 'quantity': qty, **extra}, token or self.buyer, status=201)['offer']

    def test_offer_validation(self):
        lid = self.lot['id']
        for body in [{'price': 0, 'quantity': 5}, {'price': -5, 'quantity': 5}, {'price': 100, 'quantity': 0}, {'price': 100, 'quantity': 31}, {'price': 'x', 'quantity': 5}]:
            self.err('POST', '/api/offers', {'lotId': lid, 'farmerLotId': lid, **body}, self.buyer)
        self.err('POST', '/api/offers', {'lotId': 'LOT-0000', 'price': 100, 'quantity': 1}, self.buyer, status=404)
        self.err('POST', '/api/offers', {'lotId': lid, 'price': 100, 'quantity': 1}, self.farmer, status=403)

    def test_amount_is_computed_server_side_and_duplicates_blocked(self):
        o = self.bid(price=1700, qty=10, amount=1)   # a client-sent amount is ignored
        self.assertEqual(o['amount'], 17000)
        self.assertEqual(o['buyer'], 'Test Traders')
        self.err('POST', '/api/offers', {'lotId': self.lot['id'], 'farmerLotId': self.lot['id'], 'price': 1, 'quantity': 1}, self.buyer, status=409, code='duplicate_offer')

    def test_bid_on_builtin_sample_listing(self):
        o = self.ok('POST', '/api/offers', {'lotId': 'LOT-2201', 'price': 1600, 'quantity': 10}, self.buyer, status=201)['offer']
        self.assertEqual(o['farmer'], 'Suresh Jadhav')
        self.assertIsNone(o['farmerLotId'])
        self.err('POST', '/api/offers', {'lotId': 'LOT-2201', 'price': 1600, 'quantity': 999}, self.buyer)

    def test_farmer_sees_bids_and_buyer_withdraws(self):
        o = self.bid()
        self.assertIn(o['id'], [x['id'] for x in self.ok('GET', '/api/offers', token=self.farmer)['offers']])
        self.assertIn(o['id'], [x['id'] for x in self.ok('GET', '/api/offers', token=self.buyer)['offers']])
        self.assertEqual(self.ok('POST', f"/api/offers/{o['id']}/withdraw", token=self.buyer)['offer']['status'], 'Withdrawn')
        self.err('POST', f"/api/offers/{o['id']}/withdraw", token=self.buyer, status=409)
        other, _, _ = self.register('buyer')
        self.err('POST', f"/api/offers/{o['id']}/withdraw", token=other, status=404)

    def test_notification_reaches_farmer(self):
        self.bid()
        n = self.ok('GET', '/api/notifications', token=self.farmer)
        self.assertGreaterEqual(n['unread'], 1)
        self.assertIn('New bid', n['notifications'][0]['title'])
        self.ok('POST', '/api/notifications/read', {}, self.farmer)
        self.assertEqual(self.ok('GET', '/api/notifications', token=self.farmer)['unread'], 0)

    def test_accept_bid_creates_order_declines_rivals_locks_lot(self):
        winner = self.bid(price=1700, qty=25)
        rival_tok, _, _ = self.register('buyer', company='Rival Co')
        rival = self.bid(price=1600, qty=5, token=rival_tok)
        res = self.ok('POST', f"/api/lots/{self.lot['id']}/accept", {'optionId': winner['id'], 'offerId': winner['id'], 'orderId': 'ORD-5551'}, self.farmer, status=201)
        o = res['order']
        self.assertEqual((o['id'], o['buyer'], o['rate'], o['quantity'], o['amount'], o['stage']), ('ORD-5551', 'Test Traders', 1700, 25, 42500, 0))
        self.assertEqual(res['lot']['status'], 'Offer Accepted')
        offers = {x['id']: x['status'] for x in self.ok('GET', '/api/offers', token=rival_tok)['offers']}
        self.assertEqual(offers[rival['id']], 'Declined')
        self.assertEqual(self.ok('GET', '/api/orders', token=self.buyer)['orders'][0]['id'], 'ORD-5551')   # buyer sees it too
        self.err('POST', f"/api/lots/{self.lot['id']}/accept", {'optionId': 'x', 'buyer': 'Other', 'rate': 1}, self.farmer, status=409, code='lot_closed')
        self.err('POST', '/api/offers', {'lotId': self.lot['id'], 'farmerLotId': self.lot['id'], 'price': 5, 'quantity': 1}, rival_tok, status=409)

    def test_accept_computed_option_uses_validated_rate(self):
        self.err('POST', f"/api/lots/{self.lot['id']}/accept", {'optionId': 'o1', 'buyer': 'X', 'rate': 0}, self.farmer)
        self.err('POST', f"/api/lots/{self.lot['id']}/accept", {'optionId': 'o1', 'buyer': '', 'rate': 100}, self.farmer)
        o = self.ok('POST', f"/api/lots/{self.lot['id']}/accept", {'optionId': 'o1', 'buyer': 'FPO Combined Lot', 'rate': 1520}, self.farmer, status=201)['order']
        self.assertEqual(o['amount'], 1520 * 30)

    def test_only_owner_can_accept(self):
        other, _, _ = self.register('farmer')
        self.err('POST', f"/api/lots/{self.lot['id']}/accept", {'optionId': 'o1', 'buyer': 'X', 'rate': 10}, other, status=404)
        self.err('POST', f"/api/lots/{self.lot['id']}/accept", {'optionId': 'o1', 'buyer': 'X', 'rate': 10}, self.buyer, status=403)

    def test_cancel_within_window_restores_everything(self):
        o = self.bid()
        self.ok('POST', f"/api/lots/{self.lot['id']}/accept", {'optionId': o['id'], 'offerId': o['id']}, self.farmer, status=201)
        lot = self.ok('POST', f"/api/lots/{self.lot['id']}/cancel-accept", {}, self.farmer)['lot']
        self.assertEqual(lot['status'], 'Recommendation Ready')
        self.assertEqual(self.ok('GET', '/api/orders', token=self.farmer)['orders'], [])
        self.assertEqual(self.ok('GET', '/api/offers', token=self.buyer)['offers'][0]['status'], 'Pending')
        self.err('POST', f"/api/lots/{self.lot['id']}/cancel-accept", {}, self.farmer, status=409, code='nothing_to_cancel')

    def test_cancel_refused_after_window_or_pickup(self):
        o = self.bid()
        self.ok('POST', f"/api/lots/{self.lot['id']}/accept", {'optionId': o['id'], 'offerId': o['id'], 'orderId': 'ORD-6001'}, self.farmer, status=201)
        self.ok('POST', '/api/orders/ORD-6001/stage', {'stage': 1}, self.farmer)
        self.err('POST', f"/api/lots/{self.lot['id']}/cancel-accept", {}, self.farmer, status=409, code='pickup_started')
        lot2 = self.ok('POST', '/api/lots', {'crop': 'Onion', 'quantity': 5, 'grade': 'Grade A'}, self.farmer, status=201)['lot']
        self.ok('POST', f"/api/lots/{lot2['id']}/accept", {'optionId': 'o', 'buyer': 'B', 'rate': 100}, self.farmer, status=201)
        self.httpd.app.db.conn().execute('UPDATE lots SET accepted_at = ? WHERE id = ?', (int(time.time() * 1000) - 25 * 3600 * 1000, lot2['id']))
        self.err('POST', f"/api/lots/{lot2['id']}/cancel-accept", {}, self.farmer, status=409, code='window_closed')

    def test_order_stages_advance_one_at_a_time_by_parties_only(self):
        o = self.bid()
        order = self.ok('POST', f"/api/lots/{self.lot['id']}/accept", {'optionId': o['id'], 'offerId': o['id'], 'orderId': 'ORD-6002'}, self.farmer, status=201)['order']
        stranger, _, _ = self.register('farmer')
        self.err('POST', '/api/orders/ORD-6002/stage', {'stage': 1}, stranger, status=404)
        self.err('POST', '/api/orders/ORD-6002/stage', {'stage': 3}, self.farmer, status=409, code='invalid_stage')
        self.err('POST', '/api/orders/ORD-6002/stage', {'stage': 0}, self.farmer)
        for s in (1, 2, 3):
            self.ok('POST', '/api/orders/ORD-6002/stage', {'stage': s}, self.farmer if s % 2 else self.buyer)
        self.ok('POST', '/api/orders/ORD-6002/stage', {'stage': 4}, self.buyer)
        self.assertEqual(self.ok('GET', '/api/lots/' + self.lot['id'], token=self.farmer)['lot']['status'], 'Payment Received')
        detail = self.ok('GET', '/api/orders/ORD-6002', token=self.farmer)
        self.assertEqual([e['stage'] for e in detail['events']], ['Offer Accepted', 'Picked Up', 'In Transit', 'Delivered', 'Payment Received'])
        self.err('POST', '/api/orders/ORD-6002/stage', {'stage': 5}, self.farmer)

    def test_sync_snapshot_is_role_scoped(self):
        o = self.bid()
        f = self.ok('GET', '/api/sync', token=self.farmer)
        self.assertEqual([x['id'] for x in f['offers']], [o['id']])
        self.assertEqual(f['lots'][0]['id'], self.lot['id'])
        self.assertEqual(f['marketLots'], [])
        b = self.ok('GET', '/api/sync', token=self.buyer)
        self.assertEqual(b['lots'], [])
        self.assertIn(self.lot['id'], [l['id'] for l in b['marketLots']])


class Community(ApiTestCase):
    def test_grievance_lifecycle_and_privacy(self):
        a, _, _ = self.register('farmer')
        b, _, _ = self.register('buyer')
        for bad in [{'type': 'Nonsense', 'description': 'long enough description'}, {'type': 'Other', 'description': 'short'}, {'type': 'Other', 'description': 'x' * 1001},
                    {'type': 'Other', 'description': 'long enough description', 'ref': 'DROP TABLE'}]:
            self.err('POST', '/api/grievances', bad, a)
        g = self.ok('POST', '/api/grievances', {'id': 'GR-ABC123', 'type': 'Payment delay', 'description': 'Buyer has not paid after 5 days.', 'ref': 'ORD-1234'}, a, status=201)['grievance']
        self.assertEqual((g['id'], g['status']), ('GR-ABC123', 'Submitted'))
        self.err('GET', '/api/grievances/GR-ABC123', token=b, status=404)
        self.assertEqual(self.ok('GET', '/api/grievances', token=b)['grievances'], [])
        g = self.ok('POST', '/api/grievances/GR-ABC123/advance', token=a)['grievance']
        self.assertEqual(g['status'], 'Under Review')
        g = self.ok('POST', '/api/grievances/GR-ABC123/advance', token=a)['grievance']
        self.assertEqual([h['status'] for h in g['history']], ['Submitted', 'Under Review', 'Resolved'])
        self.err('POST', '/api/grievances/GR-ABC123/advance', token=a, status=409, code='already_resolved')

    def test_pool_contribution_rules(self):
        token, _, _ = self.register('farmer')
        pools = {p['id']: p for p in self.ok('GET', '/api/pools', token=token)['pools']}
        self.assertEqual(pools['P1']['pooledQty'], 70)
        self.err('PUT', '/api/pools/P1/contribution', {'qty': 10}, token, status=409, code='insufficient_stock')   # no tomato lot yet
        self.ok('POST', '/api/lots', {'crop': 'Tomato', 'quantity': 40, 'grade': 'Premium Quality'}, token, status=201)
        self.err('PUT', '/api/pools/P1/contribution', {'qty': 41}, token, status=409, code='insufficient_stock')
        self.err('PUT', '/api/pools/P1/contribution', {'qty': 0}, token)
        p = self.ok('PUT', '/api/pools/P1/contribution', {'qty': 30}, token)['pool']
        self.assertEqual((p['myQty'], p['status']['total'], p['status']['uplift'], p['status']['pricePerQtl']), (30, 100, 40, 1690))
        p = self.ok('PUT', '/api/pools/P1/contribution', {'qty': 10}, token)['pool']   # update, not add
        self.assertEqual(p['status']['total'], 80)
        p = self.ok('DELETE', '/api/pools/P1/contribution', token=token)['pool']
        self.assertEqual((p['myQty'], p['status']['uplift']), (0, 0))

    def test_pool_totals_aggregate_across_users_and_cap_at_target(self):
        a, _, _ = self.register('farmer')
        b, _, _ = self.register('farmer')
        for t in (a, b):
            self.ok('POST', '/api/lots', {'crop': 'Soybean', 'quantity': 200, 'grade': 'Grade A'}, t, status=201)
        self.ok('PUT', '/api/pools/P4/contribution', {'qty': 100}, a)               # 120 base + 100 = 220 of 250
        view = {p['id']: p for p in self.ok('GET', '/api/pools', token=b)['pools']}['P4']
        self.assertEqual(view['pooledQty'], 220)                                     # b sees a's contribution
        self.err('PUT', '/api/pools/P4/contribution', {'qty': 31}, b, status=409, code='pool_full')
        done = self.ok('PUT', '/api/pools/P4/contribution', {'qty': 30}, b)['pool']
        self.assertTrue(done['status']['filled'])
        self.ok('DELETE', '/api/pools/P4/contribution', token=a)
        self.ok('DELETE', '/api/pools/P4/contribution', token=b)

    def test_buyers_cannot_join_pools(self):
        buyer, _, _ = self.register('buyer')
        self.err('PUT', '/api/pools/P1/contribution', {'qty': 5}, buyer, status=403)

    def test_shared_trip_capacity_pricing_and_cancel(self):
        a, _, _ = self.register('farmer')
        b, _, _ = self.register('farmer')
        t = {x['id']: x for x in self.ok('GET', '/api/trips', token=a)['trips']}['ST2']      # capacity 30, 12 booked
        self.assertEqual((t['seatsLeft'], t['bookedQtl']), (18, 12))
        self.err('POST', '/api/trips/ST2/book', {'qty': 19}, a, status=409, code='trip_full')
        self.err('POST', '/api/trips/ST2/book', {'qty': 0}, a)
        bk = self.ok('POST', '/api/trips/ST2/book', {'qty': 10}, a, status=201)['trip']['myBooking']
        self.assertAlmostEqual(bk['perQtl'], 22 * 44 / 22, places=4)                       # 968 / (12+10)
        self.assertAlmostEqual(bk['myCost'], 440, places=4)
        self.err('POST', '/api/trips/ST2/book', {'qty': 5}, a, status=409, code='already_booked')
        self.err('POST', '/api/trips/ST2/book', {'qty': 9}, b, status=409, code='trip_full')   # only 8 left now
        self.ok('POST', '/api/trips/ST2/book', {'qty': 8}, b, status=201)
        self.ok('DELETE', '/api/trips/ST2/book', token=a)
        self.assertEqual({x['id']: x for x in self.ok('GET', '/api/trips', token=b)['trips']}['ST2']['seatsLeft'], 10)
        self.ok('DELETE', '/api/trips/ST2/book', token=b)

    def test_concurrent_bookings_never_overfill(self):
        import threading
        tokens = [self.register('farmer')[0] for _ in range(8)]
        results = []

        def go(tok):
            results.append(self.call('POST', '/api/trips/ST3/book', {'qty': 20}, tok)[0])   # capacity 70, 20 booked -> room for 2

        threads = [threading.Thread(target=go, args=(t,)) for t in tokens]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(sorted(results).count(201), 2, results)
        self.assertEqual(sorted(results).count(409), 6, results)
        for tok in tokens:
            self.call('DELETE', '/api/trips/ST3/book', token=tok)

    def test_bookings_catalogue_validated_and_unique(self):
        token, _, _ = self.register('farmer')
        self.err('POST', '/api/bookings', {'type': 'hotel', 'name': 'X'}, token)
        self.err('POST', '/api/bookings', {'type': 'transport', 'name': 'No Such Co'}, token, status=404)
        b = self.ok('POST', '/api/bookings', {'type': 'storage', 'name': 'Krishi Cold Storage'}, token, status=201)['booking']
        self.err('POST', '/api/bookings', {'type': 'storage', 'name': 'Krishi Cold Storage'}, token, status=409)
        self.assertEqual(len(self.ok('GET', '/api/bookings', token=token)['bookings']), 1)
        self.ok('DELETE', f"/api/bookings/{b['id']}", token=token)
        self.err('DELETE', f"/api/bookings/{b['id']}", token=token, status=404)


class Admin(ApiTestCase):
    def test_admin_requires_key(self):
        self.err('GET', '/api/admin/stats', status=401)
        s, d, _ = self.call('GET', '/api/admin/stats', headers={'X-Admin-Key': 'wrong'})
        self.assertEqual(s, 401)
        s, d, _ = self.call('GET', '/api/admin/stats', headers={'X-Admin-Key': 'test-admin'})
        self.assertEqual(s, 200)
        self.assertIn('users', d)

    def test_admin_resolves_grievance(self):
        t, _, _ = self.register('farmer')
        gid = self.ok('POST', '/api/grievances', {'type': 'Other', 'description': 'something went wrong here'}, t, status=201)['grievance']['id']
        s, d, _ = self.call('POST', f'/api/admin/grievances/{gid}/advance', headers={'X-Admin-Key': 'test-admin'})
        self.assertEqual((s, d['grievance']['status']), (200, 'Under Review'))
        users = self.call('GET', '/api/admin/users', headers={'X-Admin-Key': 'test-admin'})[1]['users']
        self.assertTrue(all('password' not in str(u) for u in users))


class Feedback(ApiTestCase):
    def test_feedback_validated_stored_and_visible_to_admin_only(self):
        tok, _, _ = self.register('farmer')
        for bad in [{}, {'rating': 0, 'category': 'Bug', 'message': 'long enough'}, {'rating': 6, 'category': 'Bug', 'message': 'long enough'},
                    {'rating': 3, 'category': 'Nope', 'message': 'long enough'}, {'rating': 3, 'category': 'Bug', 'message': 'hey'},
                    {'rating': 3, 'category': 'Bug', 'message': 'x' * 2001}, {'rating': 'five', 'category': 'Bug', 'message': 'long enough'}]:
            self.err('POST', '/api/feedback', bad, tok)
        self.err('POST', '/api/feedback', {'rating': 3, 'category': 'Bug', 'message': 'long enough'}, status=401)
        self.ok('POST', '/api/feedback', {'rating': 4, 'category': 'Confusing', 'message': 'I could not find the shared trips tab.', 'page': '#/logistics'}, tok, status=201)
        self.err('GET', '/api/admin/feedback', status=401)
        s, d, _ = self.call('GET', '/api/admin/feedback', headers={'X-Admin-Key': 'test-admin'})
        self.assertEqual(s, 200)
        self.assertEqual(d['feedback'][0]['category'], 'Confusing')
        self.assertEqual(d['feedback'][0]['page'], '#/logistics')

    def test_feedback_rate_limited(self):
        tok, _, _ = self.register('buyer')
        for _ in range(10):
            self.ok('POST', '/api/feedback', {'rating': 5, 'category': 'Praise', 'message': 'works nicely for me'}, tok, status=201)
        self.err('POST', '/api/feedback', {'rating': 5, 'category': 'Praise', 'message': 'works nicely for me'}, tok, status=429)


class ProductionMode(ApiTestCase):
    cfg_overrides = {'demo_mode': False}

    def test_demo_accounts_and_grievance_shortcut_disabled(self):
        self.err('POST', '/api/auth/login', {'phone': '9876543210', 'password': 'demo123'}, status=401)
        t, _, _ = self.register('farmer')
        gid = self.ok('POST', '/api/grievances', {'type': 'Other', 'description': 'something went wrong here'}, t, status=201)['grievance']['id']
        self.err('POST', f'/api/grievances/{gid}/advance', token=t, status=403)


if __name__ == '__main__':
    unittest.main()
