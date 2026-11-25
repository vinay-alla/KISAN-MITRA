# Kisan Mitra API

A JSON REST API served by `devserver.py` (Python standard library + SQLite, no dependencies). The
same process also serves the static app. Base path: `/api`.

```
python devserver.py                      # http://127.0.0.1:8800
python -m unittest discover -s server/tests -t .     # 40 API tests
```

## Conventions

- **Auth:** `Authorization: Bearer <token>` from `/auth/login` or `/auth/register`. Tokens are HMAC-signed,
  expire after 7 days, and every token is tied to a server-side session row, so logout / password change
  revokes it immediately.
- **Errors:** every non-2xx response is `{"error": {"code": "...", "message": "...", "details"?: {...}}}`.
  `message` is safe to show to a user; branch on `code`.
- **IDs:** clients may mint `LOT-1234`, `OFR-1234`, `ORD-1234`, `GR-ABC123` ids so an optimistic UI and the
  server agree; a clash returns `409 id_taken`. The server validates the shape.
- **Money / quantity:** rupees and quintals as JSON numbers. `amount` is **always computed server-side**
  (price × quantity); a client-sent amount is ignored.
- **Limits:** 2 MB request bodies (`413`), JSON content type required (`415`), 5 failed logins per
  phone+IP per 5 min (`429` + `Retry-After`), 10 sign-ups/hour/IP.
- **Roles:** `farmer`, `buyer`, `fpo_operator`. A route restricted to other roles returns `403 forbidden`.

## Endpoints

### Public
| | | |
|---|---|---|
| GET | `/health` | `{status, demoMode, liveMandi}` — the front end uses this to detect a backend |
| GET | `/catalog` | commodities, transport providers, storage facilities, buyers, order stages |
| GET | `/mandi?commodity=&state=` | proxy for live mandi prices (503 unless `DATA_GOV_IN_API_KEY` is set), cached 5 min |

### Accounts
| | | |
|---|---|---|
| POST | `/auth/register` | `{role, fullName, phone, password, location?, company?, fpo?, language?, weather?}` → `201 {token, user}` |
| POST | `/auth/login` | `{phone, password, role?}` → `{token, user}`. `401 invalid_credentials` (identical for unknown number and wrong password), `403 role_mismatch` only after the password is correct |
| POST | `/auth/logout`, `/auth/logout-all` | revoke this / every session |
| GET | `/auth/me` | current user |
| PATCH | `/me` | `fullName, location, company (buyer), fpo, language, weather, designation` |
| POST | `/me/password` | `{currentPassword, newPassword}`; revokes the other sessions |
| DELETE | `/me` | `{password}` — deletes the account and everything it owns |
| GET | `/sync` | snapshot of everything the client mirrors for the signed-in user (lots, offers, orders, grievances, pool/trip totals, bookings, marketplace, unread count) |

### Marketplace (farmer ↔ buyer)
| | | |
|---|---|---|
| GET/POST | `/lots` | farmer's lots / create `{crop, quantity, grade, harvestDate?, location?, askingPrice?, photo?, id?}` |
| GET/PATCH/DELETE | `/lots/{id}` | PATCH `quantity, grade, …` (locked while an offer is accepted); DELETE refused while accepted |
| GET | `/market/lots?crop=&q=&limit=&offset=` | other farmers' open lots (buyers browse these) |
| POST | `/offers` | buyer bids `{lotId, farmerLotId?, price, quantity, id?}`. Rejects own lot, closed lot, qty > lot, duplicate pending bid |
| GET | `/offers` | buyer: bids placed · farmer: bids received |
| POST | `/offers/{id}/withdraw` · `/offers/{id}/decline` | buyer / farmer, pending offers only |
| POST | `/lots/{id}/accept` | farmer: `{optionId, offerId?, buyer?, rate?, orderId?}`. Atomically creates the order, locks the lot, accepts the bid and declines rivals. With `offerId` the buyer, rate and quantity come from the stored bid |
| POST | `/lots/{id}/cancel-accept` | 24-hour cooling-off, only before pickup (`window_closed`, `pickup_started`) |
| GET | `/orders`, `/orders/{id}` | either party; detail includes the stage timeline |
| POST | `/orders/{id}/stage` | `{stage}` — must be exactly the next stage; the other party is notified; the final stage closes the lot |

### Community
| | | |
|---|---|---|
| GET/POST | `/grievances` | `{type, description (10–1000 chars), ref?, id?}` |
| POST | `/grievances/{id}/advance` | **demo mode only** — stands in for a support agent |
| GET | `/pools` | rounds with live totals, tier status and the caller's share |
| PUT/DELETE | `/pools/{id}/contribution` | farmer commits `{qty}`; limited to the quintals they have unsold of that crop and to the pool's remaining room |
| GET | `/trips` | shared trips with seats left |
| POST/DELETE | `/trips/{id}/book` | `{qty}`; seat checks run inside a write transaction (a concurrency test fires 8 racing bookings at 2 free seats) |
| GET/POST/DELETE | `/bookings` | transport / storage reservations |
| GET | `/notifications?unread=1` · POST `/notifications/read` | `{ids?}` marks given (or all) as read |

### Admin (`X-Admin-Key`, enabled by `KM_ADMIN_KEY`)
`GET /admin/stats` · `GET /admin/users` · `GET /admin/grievances` · `POST /admin/grievances/{id}/advance`

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `KM_DB_PATH` | `data/kisanmitra.db` | SQLite file (WAL mode) |
| `KM_SECRET` | generated, stored in the DB | token-signing secret |
| `KM_TOKEN_TTL` | `604800` | session lifetime, seconds |
| `KM_DEMO_MODE` | `1` | seeds demo accounts (password `demo123`) and enables grievance advancing. **Set `0` for any real deployment** |
| `KM_ADMIN_KEY` | unset | enables `/admin/*` |
| `KM_CORS_ORIGIN` | unset | allow a browser app on another origin (e.g. GitHub Pages); set the front end's backend with `localStorage['kisanmitra:apiBase']` |
| `DATA_GOV_IN_API_KEY` | unset | live mandi prices |

## Security notes

- Passwords: PBKDF2-HMAC-SHA-256, 200k iterations, per-user salt; constant-time comparison; unknown users are
  verified against a dummy hash so timing doesn't reveal which numbers exist.
- All SQL is parameterised. Only `index.html`, `manifest.json`, `sw.js`, `css/`, `js/`, `assets/`, `docs/` are
  web-visible — never `server/`, `data/`, tests or dotfiles (tested, including `..` and `%2e%2e`).
- Responses carry `nosniff`, `X-Frame-Options: DENY` and a strict referrer policy; API responses are `no-store`.
- Not included (deliberately out of prototype scope): TLS (put it behind a reverse proxy), email/SMS OTP,
  a CSP (the app loads Tailwind from a CDN), password-reset, and real payment rails.
