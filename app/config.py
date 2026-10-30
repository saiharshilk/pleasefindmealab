"""Settings, read once from environment variables (see .env.example)."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    openalex_api_key: str | None
    openalex_mailto: str | None
    cache_path: str
    cache_ttl_seconds: int
    searches_per_hour_per_ip: int
    trust_proxy_headers: bool


def _flag(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    return default if value is None else value.strip().lower() in ("1", "true", "yes")


def load_settings() -> Settings:
    # Vercel sets VERCEL=1. Its functions run from a read-only folder (only /tmp is
    # writable), and sit behind Vercel's proxy, which sets the real client IP header.
    on_vercel = bool(os.environ.get("VERCEL"))
    return Settings(
        openalex_api_key=os.environ.get("OPENALEX_API_KEY") or None,
        openalex_mailto=os.environ.get("OPENALEX_MAILTO") or None,
        cache_path=os.environ.get("CACHE_PATH", "/tmp/pleasefindmealab-cache.sqlite3" if on_vercel else "cache.sqlite3"),
        cache_ttl_seconds=int(os.environ.get("CACHE_TTL_SECONDS", str(24 * 3600))),
        searches_per_hour_per_ip=int(os.environ.get("SEARCHES_PER_HOUR_PER_IP", "30")),
        trust_proxy_headers=_flag("TRUST_PROXY_HEADERS", on_vercel),
    )
