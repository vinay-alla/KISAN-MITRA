"""Kisan Mitra server: the static app plus the REST API backed by SQLite.

Usage:
    python devserver.py                 # http://127.0.0.1:8800
    python devserver.py 3000            # custom port
    python devserver.py 8800 0.0.0.0    # expose on your LAN (e.g. to test on a phone)

Everything is standard library — no pip install. Configuration is by environment variable:
    KM_DB_PATH           SQLite file (default data/kisanmitra.db)
    KM_SECRET            token-signing secret (default: generated once and kept in the database)
    KM_DEMO_MODE         1 (default) seeds the demo accounts; set 0 for a real deployment
    KM_ADMIN_KEY         enables the /api/admin/* endpoints (sent as the X-Admin-Key header)
    KM_CORS_ORIGIN       allow a browser app hosted elsewhere (e.g. https://user.github.io)
    DATA_GOV_IN_API_KEY  enables live mandi prices at /api/mandi
See docs/API.md for the endpoint reference.
"""
import sys

from server.app import serve

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8800
    host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
    serve(host, port)
