"""pleasefindmealab API, plus the static web page.

    GET /api/search?q=soft+robots&country=US&years=3
    GET /api/professor/A5070063268
    GET /api/health
"""

import datetime
import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import FastAPI, HTTPException, Path as PathParam, Query, Request
from fastapi.staticfiles import StaticFiles

from app.cache import Cache
from app.config import Settings, load_settings
from app.openalex import BudgetExhausted, OpenAlexClient, OpenAlexError
from app.ranking import build_profile, rank_professors
from app.ratelimit import RateLimiter

log = logging.getLogger("pleasefindmealab")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
PROFESSOR_YEARS = 3


def _this_year() -> int:
    return datetime.date.today().year


def _normalize_query(q: str) -> str:
    return re.sub(r"\s+", " ", q).strip()


def create_app(settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if not settings.openalex_api_key:
            log.warning("OPENALEX_API_KEY is not set: sharing the tiny $0.10/day anonymous budget")
        app.state.openalex = OpenAlexClient(settings.openalex_api_key, settings.openalex_mailto, transport)
        app.state.cache = Cache(settings.cache_path, settings.cache_ttl_seconds)
        app.state.limiter = RateLimiter(settings.searches_per_hour_per_ip, 3600)
        yield
        await app.state.openalex.aclose()
        app.state.cache.close()

    app = FastAPI(title="pleasefindmealab", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")

    async def _call(coro):
        try:
            return await coro
        except BudgetExhausted:
            raise HTTPException(503, "We've used up today's free search budget. Please try again tomorrow.")
        except LookupError:
            raise HTTPException(404, "Not found")
        except OpenAlexError as e:
            log.error("OpenAlex call failed: %s", e)
            raise HTTPException(502, "The paper database is having trouble right now. Please try again.")

    @app.middleware("http")
    async def revalidate_static_files(request: Request, call_next):
        # Without a Cache-Control header browsers may reuse an old app.js/brain.js for a
        # while after a deploy. "no-cache" still caches, but checks the ETag first (a cheap 304).
        response = await call_next(request)
        if not request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.get("/api/health")
    async def health():
        return {"ok": True}

    @app.get("/api/search")
    async def search(
        request: Request,
        q: Annotated[str, Query(min_length=3, max_length=200, description="Research keywords")],
        country: Annotated[str | None, Query(pattern=r"^[A-Za-z]{2}$", description="ISO country code, e.g. US")] = None,
        years: Annotated[int, Query(ge=1, le=10)] = 3,
    ):
        query = _normalize_query(q)
        if len(query) < 3:
            raise HTTPException(422, "Query is too short")
        country = country.upper() if country else None
        to_year = _this_year()
        from_year = to_year - years + 1

        key = f"search:{query.lower()}|{country}|{from_year}-{to_year}"
        cached = request.app.state.cache.get(key)
        if cached is not None:
            return {**cached, "cached": True}

        # Only uncached searches spend OpenAlex budget, so only they count against the limit.
        client_ip = request.client.host if request.client else "unknown"
        if not request.app.state.limiter.allow(client_ip):
            raise HTTPException(429, "Too many searches. Please wait a bit and try again.")

        data = await _call(request.app.state.openalex.search_works(query, from_year, to_year, country))
        works = data.get("results") or []
        result = {
            "query": query,
            "country": country,
            "years": years,
            "from_year": from_year,
            "to_year": to_year,
            "matched_papers": len(works),
            "total_papers": (data.get("meta") or {}).get("count", len(works)),
            "professors": rank_professors(works, to_year, country),
        }
        request.app.state.cache.set(key, result)
        return {**result, "cached": False}

    @app.get("/api/professor/{author_id}")
    async def professor(
        request: Request,
        author_id: Annotated[str, PathParam(pattern=r"^[Aa]\d{1,15}$", description="OpenAlex author id, e.g. A5070063268")],
    ):
        author_id = author_id.upper()
        key = f"professor:{author_id}"
        cached = request.app.state.cache.get(key)
        if cached is not None:
            return {**cached, "cached": True}

        since = _this_year() - PROFESSOR_YEARS + 1
        oa = request.app.state.openalex
        author = await _call(oa.get_author(author_id))
        works = await _call(oa.author_works(author_id, since))
        result = build_profile(author, works.get("results") or [], since)
        request.app.state.cache.set(key, result)
        return {**result, "cached": False}

    # Last, so /api/* routes win. Serves static/index.html at "/".
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
    return app


app = create_app()
