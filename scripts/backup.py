"""Consistent online backup of the SQLite database (safe while the server is running).

    python scripts/backup.py                       # data/kisanmitra.db -> data/backups/
    python scripts/backup.py --keep 14 --db /data/kisanmitra.db --out /backups

Schedule it with cron / a Render cron job / Task Scheduler. Restoring is just copying a backup file
back to KM_DB_PATH while the server is stopped.
"""
import argparse
import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--db', default=str(ROOT / 'data' / 'kisanmitra.db'))
    ap.add_argument('--out', default=str(ROOT / 'data' / 'backups'))
    ap.add_argument('--keep', type=int, default=14, help='how many backups to retain')
    args = ap.parse_args()
    src, out = Path(args.db), Path(args.out)
    if not src.exists():
        raise SystemExit(f'No database at {src}')
    out.mkdir(parents=True, exist_ok=True)
    dest = out / f'kisanmitra-{time.strftime("%Y%m%d-%H%M%S")}.db'
    with sqlite3.connect(src) as a, sqlite3.connect(dest) as b:
        a.backup(b)            # SQLite's online backup API: a consistent snapshot, no locking the server out
    check = sqlite3.connect(dest).execute('PRAGMA integrity_check').fetchone()[0]
    if check != 'ok':
        dest.unlink()
        raise SystemExit(f'Backup failed its integrity check: {check}')
    for old in sorted(out.glob('kisanmitra-*.db'))[:-args.keep]:
        old.unlink()
    print(f'Backed up to {dest} ({dest.stat().st_size // 1024} KiB)')


if __name__ == '__main__':
    main()
