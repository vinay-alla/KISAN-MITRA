"""SQLite storage: schema, per-thread connections and a transaction helper."""
import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT NOT NULL UNIQUE,            -- canonical 10-digit key
  phone_display TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('farmer','buyer','fpo_operator')),
  full_name     TEXT NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  location      TEXT NOT NULL DEFAULT '',
  company       TEXT,
  fpo           TEXT,
  language      TEXT NOT NULL DEFAULT 'English',
  profile_json  TEXT NOT NULL DEFAULT '{}',      -- verified, reliability, memberSince, weather, ...
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS lots (
  id              TEXT PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop            TEXT NOT NULL,
  quantity        REAL NOT NULL CHECK (quantity > 0),
  unit            TEXT NOT NULL DEFAULT 'Quintals',
  grade           TEXT NOT NULL,
  harvest_date    TEXT NOT NULL DEFAULT 'Not set',
  location        TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'Recommendation Ready',
  asking_price    REAL,
  photo           TEXT,
  accepted_option TEXT,
  accepted_at     INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lots_user ON lots(user_id);
CREATE INDEX IF NOT EXISTS idx_lots_status ON lots(status);

CREATE TABLE IF NOT EXISTS offers (
  id             TEXT PRIMARY KEY,
  lot_id         TEXT REFERENCES lots(id) ON DELETE CASCADE,   -- a real farmer lot, or ...
  static_lot_ref TEXT,                                         -- ... a built-in sample listing
  listing_id     TEXT,                                         -- id the buyer saw in the marketplace
  buyer_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farmer_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  buyer_name     TEXT NOT NULL,
  buyer_ref      TEXT,
  farmer_name    TEXT NOT NULL,
  crop           TEXT NOT NULL,
  quantity       REAL NOT NULL CHECK (quantity > 0),
  unit           TEXT NOT NULL,
  price          REAL NOT NULL CHECK (price > 0),
  amount         REAL NOT NULL,
  status         TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Accepted','Declined','Withdrawn')),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_offers_lot ON offers(lot_id);
CREATE INDEX IF NOT EXISTS idx_offers_buyer ON offers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_offers_farmer ON offers(farmer_id);

CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,
  lot_id      TEXT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  farmer_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  offer_id    TEXT REFERENCES offers(id) ON DELETE SET NULL,
  crop        TEXT NOT NULL,
  quantity    REAL NOT NULL,
  unit        TEXT NOT NULL,
  buyer_name  TEXT NOT NULL,
  rate        REAL NOT NULL,
  amount      REAL NOT NULL,
  stage       INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_farmer ON orders(farmer_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);

CREATE TABLE IF NOT EXISTS order_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stage    INTEGER NOT NULL,
  at       INTEGER NOT NULL,
  user_id  INTEGER
);

CREATE TABLE IF NOT EXISTS grievances (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  description TEXT NOT NULL,
  ref         TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'Submitted',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_grievances_user ON grievances(user_id);

CREATE TABLE IF NOT EXISTS grievance_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  grievance_id TEXT NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  status       TEXT NOT NULL,
  at           INTEGER NOT NULL,
  by_user      INTEGER,
  note         TEXT
);

CREATE TABLE IF NOT EXISTS pools (
  id              TEXT PRIMARY KEY,
  crop            TEXT NOT NULL,
  grade           TEXT NOT NULL,
  buyer_ref       TEXT,
  buyer           TEXT NOT NULL,
  base_price      REAL NOT NULL,
  target_qty      REAL NOT NULL,
  base_pooled_qty REAL NOT NULL,
  closes          TEXT NOT NULL,
  tiers_json      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pool_contributions (
  pool_id    TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qty        REAL NOT NULL CHECK (qty > 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (pool_id, user_id)
);

CREATE TABLE IF NOT EXISTS shared_trips (
  id                TEXT PRIMARY KEY,
  route             TEXT NOT NULL,
  when_text         TEXT NOT NULL,
  provider_id       TEXT,
  vehicle           TEXT NOT NULL,
  capacity_qtl      REAL NOT NULL,
  base_booked_qtl   REAL NOT NULL,
  distance_km       REAL NOT NULL,
  rate_per_km       REAL NOT NULL,
  solo_vehicle      TEXT NOT NULL,
  solo_rate_per_km  REAL NOT NULL,
  solo_capacity_qtl REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_bookings (
  trip_id    TEXT NOT NULL REFERENCES shared_trips(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qty        REAL NOT NULL CHECK (qty > 0),
  per_qtl    REAL NOT NULL,
  my_cost    REAL NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('transport','storage')),
  name       TEXT NOT NULL,
  ref_id     TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, type, name)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  link       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  read_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        INTEGER NOT NULL,
  user_id   INTEGER,
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id TEXT,
  ip        TEXT
);
"""


class Database:
    def __init__(self, path):
        self.path = Path(path)
        if str(path) != ':memory:':
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._conns = []
        self._lock = threading.Lock()
        conn = self.conn()
        conn.executescript(SCHEMA)
        conn.execute('INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)', ('schema_version', str(SCHEMA_VERSION)))

    def conn(self) -> sqlite3.Connection:
        c = getattr(self._local, 'conn', None)
        if c is None:
            c = sqlite3.connect(self.path, isolation_level=None, check_same_thread=False, timeout=10)
            c.row_factory = sqlite3.Row
            c.execute('PRAGMA foreign_keys = ON')
            c.execute('PRAGMA journal_mode = WAL')
            c.execute('PRAGMA busy_timeout = 8000')
            self._local.conn = c
            with self._lock:
                self._conns.append(c)
        return c

    @contextmanager
    def transaction(self):
        """BEGIN IMMEDIATE takes the write lock up front, so check-then-write sequences (seat
        counts, pool capacity) cannot interleave between concurrent requests."""
        c = self.conn()
        c.execute('BEGIN IMMEDIATE')
        try:
            yield c
        except BaseException:
            c.execute('ROLLBACK')
            raise
        else:
            c.execute('COMMIT')

    def one(self, sql, args=()):
        return self.conn().execute(sql, args).fetchone()

    def all(self, sql, args=()):
        return self.conn().execute(sql, args).fetchall()

    def get_meta(self, key):
        row = self.one('SELECT value FROM meta WHERE key = ?', (key,))
        return row['value'] if row else None

    def set_meta(self, key, value):
        self.conn().execute('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', (key, value))

    def close(self):
        with self._lock:
            for c in self._conns:
                try:
                    c.close()
                except Exception:
                    pass
            self._conns.clear()
        self._local = threading.local()


def loads(text, default=None):
    try:
        return json.loads(text) if text else default
    except ValueError:
        return default
