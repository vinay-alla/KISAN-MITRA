import itertools
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from server.app import create_server
from server.config import Config


_phones = itertools.count(100000001)


class ApiTestCase(unittest.TestCase):
    """Boots a real server on an ephemeral port with a throw-away database."""
    cfg_overrides: dict = {}

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cfg = Config(db_path=Path(cls._tmp.name) / 'test.db', quiet=True, admin_key='test-admin', secret='test-secret', **{'register_limit': 10_000, **cls.cfg_overrides})
        cls.httpd = create_server(cfg, port=0)
        cls.base = f'http://127.0.0.1:{cls.httpd.server_address[1]}'
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.httpd.app.db.close()
        cls._tmp.cleanup()

    # -- tiny HTTP client: returns (status, json_or_bytes, headers)
    def call(self, method, path, body=None, token=None, headers=None, raw=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if data is not None:
            req.add_header('Content-Type', 'application/json')
        if token:
            req.add_header('Authorization', f'Bearer {token}')
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                payload, status, hdrs = r.read(), r.status, dict(r.headers)
        except urllib.error.HTTPError as e:
            payload, status, hdrs = e.read(), e.code, dict(e.headers)
        try:
            return status, json.loads(payload), hdrs
        except ValueError:
            return status, payload, hdrs

    def ok(self, method, path, body=None, token=None, status=200):
        s, data, _ = self.call(method, path, body, token)
        self.assertEqual(s, status, f'{method} {path} -> {s} {data}')
        return data

    def fail(self, method, path, body=None, token=None, status=400, code=None):
        s, data, _ = self.call(method, path, body, token)
        self.assertEqual(s, status, f'{method} {path} -> {s} {data}')
        if code:
            self.assertEqual(data['error']['code'], code, data)
        return data

    def register(self, role='farmer', **extra):
        n = next(_phones)
        body = {'role': role, 'fullName': f'Test {role.title()} {n}', 'phone': f'9{n:09d}', 'password': 'secret1', **extra}
        d = self.ok('POST', '/api/auth/register', body, status=201)
        return d['token'], d['user'], body

    def demo(self, role):
        phones = {'farmer': '9876543210', 'buyer': '9123456789', 'fpo_operator': '9988766554'}
        return self.ok('POST', '/api/auth/login', {'phone': phones[role], 'password': 'demo123', 'role': role})['token']
