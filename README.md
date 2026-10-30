# pleasefindmealab

Type what you want to research and get back the professors whose labs are leading recent work on it, with their relevant papers. Free, and built on [OpenAlex](https://openalex.org) (an open CC0 database of research papers).

## How it works

1. `GET /api/search` sends one OpenAlex full-text search: journal articles from the last N years (optionally limited to one country), sorted by relevance, top 200.
2. Each paper credits its **last author** (usually the lab head) and its **corresponding author**. Credit is the paper's relevance, scaled down for older papers. First and middle authors (mostly students) get no credit. With a country filter, only authors based in that country are credited.
3. Authors are ranked by total credit, and each comes back with up to 3 example papers.
4. `GET /api/professor/{id}` fetches the author from OpenAlex, plus their recent articles, their role on each, and frequent collaborators.

Results are cached in SQLite for 24 hours, so repeat searches don't spend OpenAlex budget. Uncached searches are rate-limited per IP.

The ranking logic is in [app/ranking.py](app/ranking.py) and is pure Python, so it's easy to tune.

## Running it locally

Requires [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env        # then paste your OpenAlex key into .env
uv sync
uv run --env-file .env uvicorn app.main:app --reload
```

Open http://localhost:8000. Interactive API docs are at http://localhost:8000/api/docs.

Run the tests (they don't call OpenAlex):

```bash
uv run pytest
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/search?q=soft+robots&country=US&years=3` | `q`: 3–200 characters. `country`: optional 2-letter ISO code. `years`: 1–10, default 3. |
| `GET /api/professor/A5070063268` | OpenAlex author ID |
| `GET /api/health` | Liveness check |

Errors return `{"detail": "..."}`: 422 for bad input, 429 when a user searches too often, 503 when the daily OpenAlex budget is used up, and 502 when OpenAlex is down.

## OpenAlex costs

OpenAlex gives each free API key **$1/day**. A search costs $0.001 (about 1,000 uncached searches a day), and a professor page costs about $0.0001. Without a key, everyone on the server's IP shares $0.10/day. Get a key at https://openalex.org/settings/api and set `OPENALEX_API_KEY`.

## Configuration

See [.env.example](.env.example): `OPENALEX_API_KEY`, `OPENALEX_MAILTO`, `CACHE_PATH`, `CACHE_TTL_SECONDS` and `SEARCHES_PER_HOUR_PER_IP`.

When deploying behind a proxy (Render, Fly, etc.), start uvicorn with `--proxy-headers --forwarded-allow-ips '*'` so rate limiting sees real client IPs. Only do this if the app can't be reached except through that proxy.
