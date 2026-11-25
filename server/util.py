"""Small shared helpers: errors, ids, time and input validation."""
import re
import secrets
import time
from datetime import datetime, timezone


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None, headers=None):
        super().__init__(message)
        self.status, self.code, self.message, self.details, self.headers = status, code, message, details, headers or {}


def bad(message, code='invalid_input', details=None):
    return ApiError(400, code, message, details)


def not_found(what='Resource'):
    return ApiError(404, 'not_found', f'{what} not found.')


def forbidden(message='You do not have permission to do that.'):
    return ApiError(403, 'forbidden', message)


def conflict(message, code='conflict'):
    return ApiError(409, code, message)


def now_ms() -> int:
    return int(time.time() * 1000)


def iso(ms):
    return None if ms is None else datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat(timespec='seconds')


def display_date(ms: int) -> str:
    """Same shape the front end's Date#toDateString().slice(4) produces, e.g. 'Nov 25 2026'."""
    return datetime.fromtimestamp(ms / 1000).strftime('%b %d %Y')


ID_RE = re.compile(r'^[A-Za-z0-9-]{3,24}$')


def new_id(prefix: str, digits: int = 4) -> str:
    return f'{prefix}-{secrets.randbelow(9 * 10 ** (digits - 1)) + 10 ** (digits - 1)}'


def phone_key(phone) -> str:
    digits = re.sub(r'\D', '', str(phone or ''))
    return digits[-10:] if len(digits) > 10 else digits


def valid_mobile(phone) -> bool:
    return re.fullmatch(r'[6-9]\d{9}', phone_key(phone)) is not None


def text(value, field, *, min_len=0, max_len=200, required=True, collapse=True):
    if value is None or (isinstance(value, str) and not value.strip()):
        if required and min_len > 0:
            raise bad(f'{field} is required.')
        return ''
    if not isinstance(value, str):
        raise bad(f'{field} must be text.')
    value = re.sub(r'\s+', ' ', value).strip() if collapse else value.strip()
    if len(value) < min_len:
        raise bad(f'{field} must be at least {min_len} characters.')
    if len(value) > max_len:
        raise bad(f'{field} must be at most {max_len} characters.')
    return value


def number(value, field, *, minimum=None, maximum=None, integer=False):
    if isinstance(value, bool) or value is None or value == '':
        raise bad(f'{field} is required.')
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise bad(f'{field} must be a number.')
    if n != n or n in (float('inf'), float('-inf')):
        raise bad(f'{field} must be a finite number.')
    if integer and n != int(n):
        raise bad(f'{field} must be a whole number.')
    if minimum is not None and n < minimum:
        raise bad(f'{field} must be at least {minimum}.')
    if maximum is not None and n > maximum:
        raise bad(f'{field} must be at most {maximum}.')
    return int(n) if integer else n


def client_id(value, prefix):
    """Accept an id minted by the client (so the optimistic UI and the server agree), if well-formed."""
    if value is None:
        return None
    if not isinstance(value, str) or not ID_RE.match(value) or not value.startswith(prefix + '-'):
        raise bad(f'id must look like {prefix}-1234.')
    return value
