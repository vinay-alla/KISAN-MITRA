"""Real-time push: an in-process hub that fans events out to Server-Sent-Events connections.

Handlers never publish directly. They queue events while the request runs and the dispatcher
flushes them only after the handler succeeded (and so after its DB transaction committed) —
otherwise a client could be told "your offer changed" and re-read the old row.
"""
import queue
import threading
import time

MAX_STREAMS_PER_USER = 5
QUEUE_SIZE = 100


class EventHub:
    def __init__(self):
        self._lock = threading.Lock()
        self._subs: dict[int, set] = {}      # user_id -> set of queues
        self._roles: dict[int, str] = {}

    def subscribe(self, user_id: int, role: str):
        with self._lock:
            subs = self._subs.setdefault(user_id, set())
            if len(subs) >= MAX_STREAMS_PER_USER:
                return None
            q = queue.Queue(QUEUE_SIZE)
            subs.add(q)
            self._roles[user_id] = role
            return q

    def unsubscribe(self, user_id: int, q):
        with self._lock:
            subs = self._subs.get(user_id)
            if subs:
                subs.discard(q)
                if not subs:
                    del self._subs[user_id]
                    self._roles.pop(user_id, None)

    def publish(self, event_type: str, data=None, user_id=None, role=None):
        """user_id=None broadcasts to everyone (optionally only to one role)."""
        payload = (event_type, data or {}, time.time())
        with self._lock:
            targets = [self._subs.get(user_id, set())] if user_id is not None else [
                s for uid, s in self._subs.items() if role is None or self._roles.get(uid) == role]
            for group in targets:
                for q in list(group):
                    try:
                        q.put_nowait(payload)
                    except queue.Full:   # a stuck client must not block everyone else: drop its backlog
                        try:
                            while True:
                                q.get_nowait()
                        except queue.Empty:
                            pass
                        q.put_nowait(('resync', {}, time.time()))

    def online(self) -> dict:
        with self._lock:
            counts: dict[str, int] = {}
            for uid in self._subs:
                role = self._roles.get(uid, 'unknown')
                counts[role] = counts.get(role, 0) + 1
            return counts


# Events queued by the request currently running on this thread.
_pending = threading.local()


def queue_event(event_type, data=None, user_id=None, role=None):
    if not hasattr(_pending, 'items'):
        _pending.items = []
    _pending.items.append((event_type, data, user_id, role))


def take_events():
    items = getattr(_pending, 'items', [])
    _pending.items = []
    return items


def discard_events():
    _pending.items = []
