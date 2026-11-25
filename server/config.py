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
        # Behind a reverse proxy (Caddy/nginx/Render) the socket peer is the proxy; trust X-Forwarded-For
        # only when explicitly told to, otherwise clients could spoof their IP to dodge rate limits.
        self.trust_proxy = overrides.get('trust_proxy', _flag('KM_TRUST_PROXY', False))
        # AI assistant + vision grading (Anthropic Messages API). Disabled unless a key is provided.
        self.ai_key = (overrides.get('ai_key', env('ANTHROPIC_API_KEY', '')) or '').strip()
        self.ai_model = overrides.get('ai_model') or env('KM_AI_MODEL') or 'claude-haiku-5-5'
        self.ai_base_url = (overrides.get('ai_base_url') or env('KM_AI_BASE_URL') or 'https://api.anthropic.com').rstrip('/')
        self.ai_per_hour = int(overrides.get('ai_per_hour') or env('KM_AI_PER_HOUR') or 30)
        self.ai_timeout_s = int(overrides.get('ai_timeout_s') or env('KM_AI_TIMEOUT') or 25)
        self.quiet = overrides.get('quiet', False)
