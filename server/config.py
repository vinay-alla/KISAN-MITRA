"""Runtime configuration, read from environment variables (see docs/API.md)."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    return default if raw is None else raw.strip().lower() in ('1', 'true', 'yes', 'on')


class Config:
    def __init__(self, **overrides):
        env = os.environ.get
        self.db_path = Path(overrides.get('db_path') or env('KM_DB_PATH') or ROOT / 'data' / 'kisanmitra.db')
        self.secret = overrides.get('secret') or env('KM_SECRET') or None   # else generated + persisted
        self.token_ttl_s = int(overrides.get('token_ttl_s') or env('KM_TOKEN_TTL') or 7 * 24 * 3600)
        self.cors_origin = overrides.get('cors_origin', env('KM_CORS_ORIGIN', '')) or ''
        self.admin_key = overrides.get('admin_key', env('KM_ADMIN_KEY', '')) or ''
        # Demo mode lets a user advance their own grievance status (there is no support desk in the
        # prototype) and seeds the demo accounts. Switch it off in any real deployment.
        self.demo_mode = overrides.get('demo_mode', _flag('KM_DEMO_MODE', True))
        self.serve_static = overrides.get('serve_static', True)
        self.mandi_api_key = overrides.get('mandi_api_key', env('DATA_GOV_IN_API_KEY', '')).strip()
        self.max_body = int(overrides.get('max_body') or 2 * 1024 * 1024)
        self.login_attempts = int(overrides.get('login_attempts') or 5)       # failures allowed ...
        self.login_window_s = int(overrides.get('login_window_s') or 300)     # ... per this window
        self.register_limit = int(overrides.get('register_limit') or 10)      # sign-ups per hour per address
        self.quiet = overrides.get('quiet', False)
