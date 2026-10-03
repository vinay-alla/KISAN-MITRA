"""Local dev server for Kisan Mitra.

Serves the static app with no-cache headers and exposes one tiny API route,
/api/mandi, that proxies live mandi prices from data.gov.in.

Usage:
    python devserver.py                 # http://127.0.0.1:8800
    python devserver.py 3000            # custom port
    python devserver.py 8800 0.0.0.0    # expose on your LAN (e.g. to test on a phone)

Live prices need a free data.gov.in API key in the DATA_GOV_IN_API_KEY environment
variable. Without it the app still works — the Market page falls back to its built-in
sample mandi data.
"""
import http.server
import json
import os
import sys
import urllib.parse
import urllib.request

# Mandi (APMC) prices are republished as open government data on data.gov.in, sourced
# from the daily eNAM / Agmarknet arrival-and-price feed. That API sends no CORS headers,
# so a browser can't call it directly — this proxy fetches it server-side instead.
MANDI_API_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070'
MANDI_API_KEY = os.environ.get('DATA_GOV_IN_API_KEY', '').strip()


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def do_GET(self):
        if self.path.startswith('/api/mandi'):
            self.handle_mandi_proxy()
            return
        super().do_GET()

    def send_json(self, status, payload):
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)

    def handle_mandi_proxy(self):
        if not MANDI_API_KEY:
            self.send_json(503, {'error': 'DATA_GOV_IN_API_KEY is not set; live prices are disabled.'})
            return

        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        commodity = (params.get('commodity') or [''])[0]
        state = (params.get('state') or [''])[0]

        upstream_params = {
            'api-key': MANDI_API_KEY,
            'format': 'json',
            'limit': '12',
            'filters[commodity]': commodity,
        }
        if state:
            upstream_params['filters[state]'] = state
        upstream_url = (
            'https://api.data.gov.in/resource/' + MANDI_API_RESOURCE + '?'
            + urllib.parse.urlencode(upstream_params)
        )

        try:
            with urllib.request.urlopen(upstream_url, timeout=5) as resp:
                self.send_json(200, resp.read())
        except Exception as e:  # network error, bad key, rate limit — the UI falls back to sample data
            self.send_json(502, {'error': str(e)})


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8800
    host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
    http.server.test(HandlerClass=NoCacheHandler, port=port, bind=host)
