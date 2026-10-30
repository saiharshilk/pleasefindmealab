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


def load_settings() -> Settings:
    return Settings(
        openalex_api_key=os.environ.get("OPENALEX_API_KEY") or None,
        openalex_mailto=os.environ.get("OPENALEX_MAILTO") or None,
        cache_path=os.environ.get("CACHE_PATH", "cache.sqlite3"),
        cache_ttl_seconds=int(os.environ.get("CACHE_TTL_SECONDS", str(24 * 3600))),
        searches_per_hour_per_ip=int(os.environ.get("SEARCHES_PER_HOUR_PER_IP", "30")),
    )
