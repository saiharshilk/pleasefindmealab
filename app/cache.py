"""A tiny SQLite key/value cache with expiry.

OpenAlex bills each search against a daily budget, so identical searches within
the TTL are answered from here instead of spending budget again.
"""

import json
import sqlite3
import threading
import time
from typing import Any


class Cache:
    def __init__(self, path: str, ttl_seconds: int):
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS cache ("
            " key TEXT PRIMARY KEY,"
            " value TEXT NOT NULL,"
            " expires_at REAL NOT NULL)"
        )
        self._db.commit()

    def get(self, key: str) -> Any | None:
        with self._lock:
            row = self._db.execute(
                "SELECT value, expires_at FROM cache WHERE key = ?", (key,)
            ).fetchone()
        if row is None or row[1] < time.time():
            return None
        return json.loads(row[0])

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._db.execute(
                "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
                (key, json.dumps(value), time.time() + self._ttl),
            )
            # Keep the file from growing forever.
            self._db.execute("DELETE FROM cache WHERE expires_at < ?", (time.time(),))
            self._db.commit()

    def close(self) -> None:
        self._db.close()
