"""In-memory per-IP token-bucket rate limiter for the chat endpoint.

Two buckets per IP, both refill on the wall clock:
  - minute bucket: capacity CHAT_RATE_PER_MINUTE (default 10)
  - day bucket:    capacity CHAT_RATE_PER_DAY     (default 200)

Swap to Redis when we have multiple backend processes; an in-memory dict is
fine for a single uvicorn worker.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from threading import Lock


@dataclass
class _Bucket:
    tokens: float
    last_refill: float


class RateLimiter:
    def __init__(self, per_minute: int, per_day: int) -> None:
        self.per_minute = per_minute
        self.per_day = per_day
        self._minute: dict[str, _Bucket] = {}
        self._day: dict[str, _Bucket] = {}
        self._lock = Lock()

    def _consume(
        self,
        bucket_map: dict[str, _Bucket],
        ip: str,
        capacity: int,
        refill_seconds: float,
    ) -> bool:
        now = time.monotonic()
        bucket = bucket_map.get(ip)
        if bucket is None:
            bucket = _Bucket(tokens=float(capacity), last_refill=now)
            bucket_map[ip] = bucket
        # Linear refill: capacity tokens per refill_seconds.
        elapsed = now - bucket.last_refill
        bucket.tokens = min(float(capacity), bucket.tokens + elapsed * capacity / refill_seconds)
        bucket.last_refill = now
        if bucket.tokens >= 1.0:
            bucket.tokens -= 1.0
            return True
        return False

    def check(self, ip: str) -> tuple[bool, str]:
        with self._lock:
            if not self._consume(self._minute, ip, self.per_minute, 60.0):
                return False, f"Rate limit: max {self.per_minute} requests/minute."
            if not self._consume(self._day, ip, self.per_day, 86400.0):
                return False, f"Rate limit: max {self.per_day} requests/day."
        return True, ""


_limiter: RateLimiter | None = None


def get_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        per_minute = int(os.environ.get("CHAT_RATE_PER_MINUTE", "10"))
        per_day = int(os.environ.get("CHAT_RATE_PER_DAY", "200"))
        _limiter = RateLimiter(per_minute, per_day)
    return _limiter
