"""Throws malformed input at every route as every role. The only acceptable answers are clean 2xx/4xx
JSON — never a 5xx, a traceback, or a non-JSON body."""
import itertools
import json
import re
import unittest

from server.core import ROUTER
from server.tests.helpers import ApiTestCase

JUNK_VALUES = [None, '', ' ', 0, -1, 1e308, float('nan') if False else 10 ** 30, True, [], {}, [1, 2], {'a': 1}, 'x' * 5000, "1' OR '1'='1", '<script>alert(1)</script>',
               '\u0000', '😀' * 50, '../../etc/passwd', {'$gt': ''}, [None], -0.0, 'ORD-1', 'LOT-1', '9' * 40]
PATH_JUNK = ['x', "1'OR'1'='1", 'LOT-0000', '%00', '..', 'a' * 300, '😀', '-1', '0']
SKIP = {('DELETE', '/api/me'), ('POST', '/api/auth/logout'), ('POST', '/api/auth/logout-all'), ('POST', '/api/me/password'), ('GET', '/api/stream')}
BODY_KEYS = ['id', 'qty', 'quantity', 'price', 'crop', 'grade', 'type', 'name', 'description', 'ref', 'lotId', 'farmerLotId', 'stage', 'optionId',
             'offerId', 'orderId', 'buyer', 'rate', 'message', 'history', 'image', 'ids', 'fullName', 'location', 'language', 'weather', 'photo',
             'harvestDate', 'askingPrice', 'phone', 'password', 'role', 'company', 'fpo', 'revertStatus', 'designation', 'rating', 'text']


def concrete(pattern, value):
    return re.sub(r'<\w+>', lambda m: value, pattern)


class Fuzz(ApiTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.cfg = cls.httpd.app.cfg

    def tokens(self):
        return {r: self.register(r)[0] for r in ('farmer', 'buyer', 'fpo_operator')}

    def check(self, method, path, body, token, raw=None):
        s, data, h = self.call(method, path, body, token, raw=raw)
        label = f'{method} {path} {json.dumps(body)[:120] if body is not None else raw!r} -> {s}'
        deliberate = isinstance(data, dict) and data.get('error', {}).get('code') in ('ai_disabled', 'mandi_disabled')   # feature switched off by config
        if not deliberate:
            self.assertLess(s, 500, label + f' {data}')
        if s >= 400 and isinstance(data, dict):
            self.assertIn('error', data, label)
            self.assertIn('code', data['error'], label)
        elif s >= 400:
            raise AssertionError(f'non-JSON error body: {label}')

    def test_every_route_survives_junk(self):
        toks = self.tokens()
        # give each role something to chew on so deeper code paths run, not just the validators
        lot = self.ok('POST', '/api/lots', {'crop': 'Tomato', 'quantity': 30, 'grade': 'Grade A'}, toks['farmer'], status=201)['lot']
        self.ok('POST', '/api/offers', {'lotId': lot['id'], 'farmerLotId': lot['id'], 'price': 1500, 'quantity': 5}, toks['buyer'], status=201)
        routes = [(m, p) for m, rx, fn, auth, roles in ROUTER.routes for p in [rx.pattern[1:-1]]]
        count = 0
        for method, rx, fn, auth, roles in ROUTER.routes:
            pattern = re.sub(r'\(\?P<(\w+)>\[\^/\]\+\)', r'<\1>', rx.pattern[1:-1])
            if (method, pattern) in SKIP:
                continue
            for role, tok in toks.items():
                token = None if auth == 'none' else tok
                for pj in (PATH_JUNK if '<' in pattern else ['']):
                    path = concrete(pattern, pj)
                    # no body, non-JSON, wrong JSON types
                    for raw in (None, b'', b'{', b'null', b'[]', b'"str"', b'1', b'\xff\xfe\x00'):
                        if method in ('POST', 'PUT', 'PATCH', 'DELETE'):
                            self.check(method, path, None, token, raw=raw)
                            count += 1
                    if method == 'GET':
                        self.check(method, path + '?limit=abc&offset=-5&q=' + 'z' * 500 + '&unread=maybe&crop=%00', None, token)
                        self.check(method, path, None, token)
                        count += 2
            # junk values in every plausible body field (once per role, with a plausible path)
            if method in ('POST', 'PUT', 'PATCH'):
                path = concrete(pattern, lot['id'])
                # one authorised role is enough for the value-level sweep (all roles already got the structural one above)
                allowed = [r for r in toks if not roles or r in roles][:1]
                for role in allowed:
                    token = None if auth == 'none' else toks[role]
                    for key, val in itertools.product(BODY_KEYS, JUNK_VALUES[:14]):
                        self.check(method, path, {key: val}, token)
                        count += 1
        self.assertGreater(count, 2000)

    def test_register_and_login_fuzz(self):
        base = {'role': 'farmer', 'fullName': 'Fuzz Tester', 'phone': '9333344444', 'password': 'secret1'}
        for key, val in itertools.product(base, JUNK_VALUES[:12]):
            self.check('POST', '/api/auth/register', {**base, key: val, 'phone': base['phone'] if key == 'phone' else f'9{abs(hash((key, str(val)))) % 10**9:09d}'}, None)
            self.check('POST', '/api/auth/login', {'phone': base['phone'], 'password': base['password'], key: val}, None)

    def test_deep_and_huge_json_do_not_crash_the_parser(self):
        tok = self.register('farmer')[0]
        deep = '[' * 5000 + ']' * 5000
        self.check('POST', '/api/lots', None, tok, raw=deep.encode())
        self.check('POST', '/api/lots', None, tok, raw=json.dumps({'crop': 'Tomato', 'quantity': 5, 'grade': 'Grade A', 'photo': 'data:image/png;base64,' + 'A' * 600000}).encode())

    def test_unicode_and_control_characters_round_trip_safely(self):
        tok = self.register('farmer', fullName='रमेश पाटील 😀', location='नाशिक')[0]
        me = self.ok('GET', '/api/auth/me', token=tok)['user']
        self.assertEqual(me['fullName'], 'रमेश पाटील 😀')
        g = self.ok('POST', '/api/grievances', {'type': 'Other', 'description': 'Line one\nLine two — <b>bold</b> & "quotes"  '}, tok, status=201)['grievance']
        self.assertIn('<b>bold</b>', g['description'])   # stored verbatim; escaping is the renderer's job


if __name__ == '__main__':
    unittest.main()
