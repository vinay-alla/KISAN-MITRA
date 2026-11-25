import http.client
import json
import time
import unittest
import urllib.parse

from server.tests.helpers import ApiTestCase


class Stream:
    """Minimal SSE client over a raw socket."""

    def __init__(self, base, ticket, timeout=5):
        host = urllib.parse.urlparse(base)
        self.conn = http.client.HTTPConnection(host.hostname, host.port, timeout=timeout)
        self.conn.request('GET', f'/api/stream?ticket={ticket}')
        self.resp = self.conn.getresponse()
        self.status = self.resp.status

    def next_event(self):
        event, data = None, None
        while True:
            line = self.resp.fp.readline()
            if not line:
                return None
            line = line.decode().rstrip('\r\n')
            if line.startswith('event:'):
                event = line[6:].strip()
            elif line.startswith('data:'):
                data = json.loads(line[5:].strip())
            elif line == '' and event:
                return event, data

    def wait_for(self, wanted, limit=8):
        end = time.time() + limit
        while time.time() < end:
            ev = self.next_event()
            if ev is None:
                return None
            if ev[0] == wanted:
                return ev[1]
        return None

    def close(self):
        self.conn.close()


class RealtimeTests(ApiTestCase):
    def ticket(self, token):
        return self.ok('POST', '/api/stream/ticket', {}, token)['ticket']

    def test_stream_requires_a_valid_ticket(self):
        s = Stream(self.base, 'garbage')
        self.assertEqual(s.status, 401)
        s.close()
        token, _, _ = self.register('farmer')
        # a session token is not a stream ticket, and a ticket is not a session token
        s = Stream(self.base, token)
        self.assertEqual(s.status, 401)
        s.close()
        self.fail('GET', '/api/auth/me', token=self.ticket(token), status=401)
        self.fail('POST', '/api/stream/ticket', {}, status=401)

    def test_hello_then_live_notification_on_a_new_bid(self):
        farmer, _, _ = self.register('farmer')
        buyer, _, _ = self.register('buyer', company='Live Co')
        lot = self.ok('POST', '/api/lots', {'crop': 'Wheat', 'quantity': 20, 'grade': 'Grade A'}, farmer, status=201)['lot']
        s = Stream(self.base, self.ticket(farmer))
        try:
            self.assertEqual(s.status, 200)
            self.assertIn('online', s.wait_for('hello'))
            self.ok('POST', '/api/offers', {'lotId': lot['id'], 'farmerLotId': lot['id'], 'price': 2300, 'quantity': 10}, buyer, status=201)
            note = s.wait_for('notification')
            self.assertIsNotNone(note, 'farmer should be told about the bid without polling')
            self.assertIn('New bid', note['title'])
        finally:
            s.close()

    def test_events_are_private_to_the_recipient(self):
        farmer, _, _ = self.register('farmer')
        other, _, _ = self.register('farmer')
        buyer, _, _ = self.register('buyer')
        lot = self.ok('POST', '/api/lots', {'crop': 'Onion', 'quantity': 20, 'grade': 'Grade A'}, farmer, status=201)['lot']
        eavesdropper = Stream(self.base, self.ticket(other), timeout=2)
        try:
            eavesdropper.wait_for('hello')
            self.ok('POST', '/api/offers', {'lotId': lot['id'], 'farmerLotId': lot['id'], 'price': 1700, 'quantity': 5}, buyer, status=201)
            try:
                got = eavesdropper.wait_for('notification', limit=2)
            except OSError:
                got = None   # socket timeout = nothing arrived
            self.assertIsNone(got)
        finally:
            eavesdropper.close()

    def test_buyers_are_told_when_a_new_lot_appears_and_everyone_when_pools_change(self):
        farmer, _, _ = self.register('farmer')
        buyer, _, _ = self.register('buyer')
        sb = Stream(self.base, self.ticket(buyer))
        sf = Stream(self.base, self.ticket(farmer))
        try:
            sb.wait_for('hello'); sf.wait_for('hello')
            self.ok('POST', '/api/lots', {'crop': 'Tomato', 'quantity': 40, 'grade': 'Grade A'}, farmer, status=201)
            self.assertIsNotNone(sb.wait_for('market'))
            self.ok('PUT', '/api/pools/P1/contribution', {'qty': 10}, farmer)
            self.assertIsNotNone(sb.wait_for('pools'))
            self.assertIsNotNone(sf.wait_for('pools'))
            self.ok('DELETE', '/api/pools/P1/contribution', token=farmer)
        finally:
            sb.close(); sf.close()

    def test_failed_requests_publish_nothing(self):
        farmer, _, _ = self.register('farmer')
        s = Stream(self.base, self.ticket(farmer), timeout=2)
        try:
            s.wait_for('hello')
            self.fail('POST', '/api/lots', {'crop': 'Nope', 'quantity': 1, 'grade': 'Grade A'}, farmer)
            try:
                got = s.wait_for('market', limit=2)
            except OSError:
                got = None
            self.assertIsNone(got)
        finally:
            s.close()

    def test_per_user_stream_cap(self):
        token, _, _ = self.register('farmer')
        streams = []
        try:
            for _ in range(5):
                st = Stream(self.base, self.ticket(token))
                self.assertEqual(st.status, 200)
                streams.append(st)
            extra = Stream(self.base, self.ticket(token))
            self.assertEqual(extra.status, 429)
            extra.close()
        finally:
            for st in streams:
                st.close()

    def test_health_reports_online_count_and_flags(self):
        h = self.ok('GET', '/api/health')
        self.assertTrue(h['realtime'])
        self.assertIn('online', h)
        self.assertIn('ai', h)


if __name__ == '__main__':
    unittest.main()
