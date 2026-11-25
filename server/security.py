"""Password hashing, signed session tokens and a small in-memory rate limiter."""
import base64
import hashlib
import hmac
import json
import secrets
import threading
import time
from collections import defaultdict, deque

SCHEME = 'pbkdf2-sha256'
ITERATIONS = 200_000   # the browser hashes at 100k for responsiveness; the server can afford more


def hash_password(password: str, iterations: int = ITERATIONS) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, iterations)
    return f'{SCHEME}${iterations}${salt.hex()}${digest.hex()}'


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt_hex, hash_hex = stored.split('$')
        if scheme != SCHEME:
            return False
        digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(digest, bytes.fromhex(hash_hex))
    except Exception:
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


class TokenSigner:
    """Compact HMAC-signed tokens: base64url(payload).base64url(signature)."""

    def __init__(self, secret: str):
        self._key = secret.encode()

    def sign(self, payload: dict) -> str:
        body = _b64(json.dumps(payload, separators=(',', ':')).encode())
        sig = hmac.new(self._key, body.encode(), hashlib.sha256).digest()
        return f'{body}.{_b64(sig)}'

    def verify(self, token: str):
        try:
            body, sig = token.split('.')
            expected = hmac.new(self._key, body.encode(), hashlib.sha256).digest()
            if not hmac.compare_digest(expected, _unb64(sig)):
                return None
            payload = json.loads(_unb64(body))
            if not isinstance(payload, dict) or payload.get('exp', 0) < time.time():
                return None
            return payload
        except Exception:
            return None


class RateLimiter:
    """Allow `limit` hits per `window` seconds per key (sliding window)."""

    def __init__(self):
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key, window, now):
        q = self._hits[key]
        while q and q[0] <= now - window:
            q.popleft()
        return q

    def blocked_for(self, key: str, limit: int, window: int) -> int:
        """Seconds until the key may try again (0 = allowed)."""
        now = time.time()
        with self._lock:
            q = self._prune(key, window, now)
            return 0 if len(q) < limit else max(1, int(q[0] + window - now) + 1)

    def hit(self, key: str, window: int):
        with self._lock:
            self._prune(key, window, time.time()).append(time.time())

    def clear(self, key: str):
        with self._lock:
            self._hits.pop(key, None)
