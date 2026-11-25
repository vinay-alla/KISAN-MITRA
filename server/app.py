"""HTTP server: request dispatch, auth, static files, error handling and logging."""
import json
import mimetypes
import queue
import secrets
import sys
import threading
import time
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import routes_ai, routes_auth, routes_community, routes_market  # noqa: F401  (importing registers the routes)
from .config import ROOT, Config
from .core import ROUTER, Ctx, admin_ok
from .db import Database
from .events import EventHub, discard_events, take_events
from .security import RateLimiter, TokenSigner, hash_password
from .seed import seed_catalogue, seed_demo_users
from .util import ApiError, now_ms

# Only these parts of the repository are web-visible; server code, the database and tests never are.
STATIC_ROOTS = ('index.html', 'manifest.json', 'sw.js', 'css', 'js', 'assets', 'docs')
SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), microphone=(self), camera=(self)',
}


class App:
    def __init__(self, cfg: Config | None = None):
        self.cfg = cfg or Config()
        self.db = Database(self.cfg.db_path)
        secret = self.cfg.secret or self.db.get_meta('signing_secret')
        if not secret:
            secret = secrets.token_hex(32)
            self.db.set_meta('signing_secret', secret)
        self.signer = TokenSigner(secret)
        self.limiter = RateLimiter()
        self.hub = EventHub()
        self.dummy_hash = hash_password('not-a-real-password')
        seed_catalogue(self.db)
        if self.cfg.demo_mode:
            seed_demo_users(self.db)

    # -- authentication ---------------------------------------------------
    def authenticate(self, ctx: Ctx):
        header = ctx.headers.get('authorization', '')
        if not header.lower().startswith('bearer '):
            raise ApiError(401, 'unauthenticated', 'Sign in to continue.')
        payload = self.signer.verify(header[7:].strip())
        if not payload:
            raise ApiError(401, 'invalid_token', 'Your session has expired. Please sign in again.')
        sess = self.db.one('SELECT * FROM sessions WHERE id = ?', (payload.get('jti'),))
        if not sess or sess['revoked'] or sess['expires_at'] < now_ms() or sess['user_id'] != payload.get('sub'):
            raise ApiError(401, 'invalid_token', 'Your session has expired. Please sign in again.')
        user = self.db.one('SELECT * FROM users WHERE id = ?', (sess['user_id'],))
        if not user:
            raise ApiError(401, 'invalid_token', 'Account no longer exists.')
        ctx.user, ctx.session_id = user, sess['id']

    # -- dispatch ---------------------------------------------------------
    def handle(self, ctx: Ctx):
        """Returns (status, payload, extra_headers). payload may be ('raw', bytes)."""
        found, params = ROUTER.match(ctx.method, ctx.path)
        if found is None:
            if params:
                raise ApiError(405, 'method_not_allowed', 'Method not allowed.', headers={'Allow': ', '.join(sorted(set(params)))})
            raise ApiError(404, 'not_found', 'No such endpoint.')
        fn, auth, roles = found
        ctx.params = params
        if auth == 'admin':
            if not admin_ok(ctx):
                raise ApiError(401, 'unauthenticated', 'Admin key required.')
        elif auth == 'user':
            self.authenticate(ctx)
            if roles and ctx.user['role'] not in roles:
                raise ApiError(403, 'forbidden', f"This action is only available to: {', '.join(roles)}.")
        try:
            result = fn(ctx)
        except BaseException:
            discard_events()          # nothing committed, so nothing to announce
            raise
        self._publish(ctx)
        status = 200
        if isinstance(result, tuple) and len(result) == 2 and isinstance(result[0], int):
            status, result = result
        return status, result


    def _publish(self, ctx: Ctx):
        for event_type, data, user_id, role in take_events():
            self.hub.publish(event_type, data, user_id=user_id, role=role)
        if ctx.method == 'GET':
            return
        # Broadcast "something you may be looking at changed" hints; clients re-read via /api/sync.
        if ctx.path.startswith(('/api/lots', '/api/offers')):
            self.hub.publish('market', {}, role='buyer')
        elif ctx.path.startswith('/api/pools'):
            self.hub.publish('pools', {})
        elif ctx.path.startswith('/api/trips'):
            self.hub.publish('trips', {})


def _static_path(url_path: str):
    rel = urllib.parse.unquote(url_path).lstrip('/') or 'index.html'
    if rel.endswith('/'):
        rel += 'index.html'
    parts = [p for p in rel.split('/') if p]
    if any(p in ('..', '.') or p.startswith('.') or '\\' in p for p in parts) or not parts or parts[0] not in STATIC_ROOTS:
        return None
    path = (ROOT / '/'.join(parts)).resolve()
    try:
        path.relative_to(ROOT)
    except ValueError:
        return None
    return path if path.is_file() else None


def make_handler(app: App):
    cfg = app.cfg

    class Handler(BaseHTTPRequestHandler):
        server_version = 'KisanMitra/1.0'
        protocol_version = 'HTTP/1.1'

        def log_message(self, fmt, *args):   # replaced by our own structured line in _finish
            pass

        # -- helpers
        def _cors(self):
            if cfg.cors_origin:
                self.send_header('Access-Control-Allow-Origin', cfg.cors_origin)
                self.send_header('Vary', 'Origin')
                self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Admin-Key')
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                self.send_header('Access-Control-Max-Age', '600')

        def _send(self, status, body: bytes, content_type, extra=None, head=False):
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            for k, v in SECURITY_HEADERS.items():
                self.send_header(k, v)
            self.send_header('X-Request-Id', self._rid)
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self._cors()
            self.end_headers()
            if not head:
                self.wfile.write(body)
            self._status = status

        def _json(self, status, payload, extra=None):
            self._send(status, json.dumps(payload, ensure_ascii=False).encode(), 'application/json; charset=utf-8', extra)

        def _error(self, e: ApiError):
            err = {'code': e.code, 'message': e.message}
            if e.details:
                err['details'] = e.details
            self._json(e.status, {'error': err}, e.headers)

        # -- main entry
        def _serve(self, method):
            self._rid = secrets.token_hex(6)
            self._status = 0
            started = time.time()
            parsed = urllib.parse.urlparse(self.path)
            try:
                if method == 'OPTIONS':
                    self.send_response(HTTPStatus.NO_CONTENT)
                    self.send_header('Content-Length', '0')
                    self._cors()
                    self.end_headers()
                    self._status = 204
                elif parsed.path.startswith('/api/'):
                    self._api(method, parsed)
                elif cfg.serve_static and method in ('GET', 'HEAD'):
                    self._static(parsed.path, method == 'HEAD')
                else:
                    self._error(ApiError(404, 'not_found', 'Not found.'))
            except ApiError as e:
                self._error(e)
            except (BrokenPipeError, ConnectionResetError):
                self._status = 499
            except Exception as e:   # never leak internals to the client
                if not cfg.quiet:
                    import traceback
                    traceback.print_exc()
                self._error(ApiError(500, 'internal_error', 'Something went wrong on the server.'))
            finally:
                app.db.release()
                if not cfg.quiet:
                    ms = (time.time() - started) * 1000
                    sys.stderr.write(f'{self._rid} {self.client_address[0]} {method} {parsed.path} -> {self._status} {ms:.0f}ms\n')

        def _client_ip(self):
            if cfg.trust_proxy:
                fwd = self.headers.get('X-Forwarded-For', '')
                if fwd:
                    return fwd.split(',')[0].strip()[:45]
            return self.client_address[0]

        def _stream(self, parsed):
            """Server-Sent Events: holds the connection open and pushes events for one user."""
            ticket = (urllib.parse.parse_qs(parsed.query).get('ticket') or [''])[0]
            payload = app.signer.verify(ticket)
            if not payload or payload.get('typ') != 'stream':
                raise ApiError(401, 'invalid_ticket', 'Stream ticket is missing or expired.')
            sess = app.db.one('SELECT * FROM sessions WHERE id = ?', (payload.get('sid'),))
            user = app.db.one('SELECT id, role FROM users WHERE id = ?', (payload.get('sub'),))
            if not sess or sess['revoked'] or sess['expires_at'] < now_ms() or not user:
                raise ApiError(401, 'invalid_ticket', 'Session is no longer valid.')
            app.db.release()   # a stream lives for hours; it must not pin a connection
            q = app.hub.subscribe(user['id'], user['role'])
            if q is None:
                raise ApiError(429, 'too_many_streams', 'Too many open live connections for this account.')
            self.close_connection = True
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Connection', 'close')
            self.send_header('X-Accel-Buffering', 'no')   # nginx: don't buffer the stream
            for k, v in SECURITY_HEADERS.items():
                self.send_header(k, v)
            self._cors()
            self.end_headers()
            self._status = 200
            try:
                self.wfile.write(b'retry: 3000\n\n')
                self._emit('hello', {'online': sum(app.hub.online().values())})
                while True:
                    try:
                        event_type, data, ts = q.get(timeout=15)
                    except queue.Empty:
                        self.wfile.write(b': ping\n\n')   # keeps proxies from idling the connection out
                        self.wfile.flush()
                        continue
                    self._emit(event_type, data)
                    # Re-check the session now and then so a logged-out tab stops receiving data.
                    if event_type in ('notification',) or time.time() % 60 < 1:
                        s2 = app.db.one('SELECT revoked, expires_at FROM sessions WHERE id = ?', (payload.get('sid'),))
                        app.db.release()
                        if not s2 or s2['revoked'] or s2['expires_at'] < now_ms():
                            return
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                pass
            finally:
                app.hub.unsubscribe(user['id'], q)
                self._status = 499

        def _emit(self, event_type, data):
            self.wfile.write(f'event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n'.encode())
            self.wfile.flush()

        def _api(self, method, parsed):
            if parsed.path == '/api/stream' and method == 'GET':
                return self._stream(parsed)
            length = int(self.headers.get('Content-Length') or 0)
            if length > cfg.max_body:
                self.close_connection = True
                raise ApiError(413, 'payload_too_large', 'Request body is too large.')
            raw = self.rfile.read(length) if length else b''
            headers = {k.lower(): v for k, v in self.headers.items()}
            ctx = Ctx(app=app, method=method, path=parsed.path.rstrip('/') or '/', query=urllib.parse.parse_qs(parsed.query),
                      headers=headers, ip=self._client_ip(), raw_body=raw)
            if method in ('POST', 'PUT', 'PATCH') and raw and 'json' not in headers.get('content-type', '').lower():
                raise ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json.')
            status, result = app.handle(ctx)
            if isinstance(result, tuple) and result and result[0] == 'raw':
                self._send(status, result[1], 'application/json; charset=utf-8')
            else:
                self._json(status, result)

        def _static(self, url_path, head):
            path = _static_path(url_path)
            if not path:
                raise ApiError(404, 'not_found', 'Not found.')
            ctype = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
            if path.suffix == '.js':
                ctype = 'text/javascript'
            if ctype.startswith('text/') or ctype in ('application/json', 'image/svg+xml'):
                ctype += '; charset=utf-8'
            self._send(200, path.read_bytes(), ctype, head=head)

        do_GET = lambda self: self._serve('GET')
        do_HEAD = lambda self: self._serve('HEAD')
        do_POST = lambda self: self._serve('POST')
        do_PUT = lambda self: self._serve('PUT')
        do_PATCH = lambda self: self._serve('PATCH')
        do_DELETE = lambda self: self._serve('DELETE')
        do_OPTIONS = lambda self: self._serve('OPTIONS')

    return Handler


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 128

    def handle_error(self, request, client_address):
        # Clients that vanish mid-request (closed tab, dropped phone connection) are routine, not errors.
        if isinstance(sys.exc_info()[1], (ConnectionError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def create_server(cfg: Config | None = None, host='127.0.0.1', port=8800):
    app = App(cfg)
    httpd = Server((host, port), make_handler(app))
    httpd.daemon_threads = True
    httpd.app = app
    return httpd


def serve(host='127.0.0.1', port=8800):
    httpd = create_server(host=host, port=port)
    app = httpd.app
    print(f'Kisan Mitra on http://{host}:{httpd.server_address[1]}  (db: {app.cfg.db_path})')
    print('  demo mode: ' + ('ON — demo accounts seeded (password demo123)' if app.cfg.demo_mode else 'off'))
    print('  live mandi prices: ' + ('enabled' if app.cfg.mandi_api_key else 'disabled (set DATA_GOV_IN_API_KEY)'))
    if app.cfg.admin_key:
        print('  admin API: enabled')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down.')
    finally:
        httpd.server_close()
        app.db.close()
