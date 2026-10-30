"""Thin async client for the OpenAlex API (https://docs.openalex.org).

Costs at the time of writing: a full-text search is $0.001 and a filter or
single-entity lookup is $0.0001-$0. A free API key gets $1/day; without one,
every caller on the same IP shares $0.10/day.
"""

import httpx

BASE_URL = "https://api.openalex.org"

WORK_FIELDS = "id,title,publication_year,doi,cited_by_count,relevance_score,authorships,primary_location"


class OpenAlexError(Exception):
    """OpenAlex failed or was unreachable."""


class BudgetExhausted(OpenAlexError):
    """The daily OpenAlex budget for our key (or IP) is used up."""


class OpenAlexClient:
    def __init__(self, api_key: str | None, mailto: str | None, transport: httpx.AsyncBaseTransport | None = None):
        self._params: dict[str, str] = {}
        if api_key:
            self._params["api_key"] = api_key
        if mailto:
            self._params["mailto"] = mailto
        self._http = httpx.AsyncClient(base_url=BASE_URL, timeout=20.0, transport=transport)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _get(self, path: str, params: dict[str, str]) -> dict:
        try:
            resp = await self._http.get(path, params={**params, **self._params})
        except httpx.HTTPError as e:
            raise OpenAlexError(f"OpenAlex unreachable: {type(e).__name__}") from e
        if resp.status_code == 429:
            raise BudgetExhausted("OpenAlex daily budget exhausted")
        if resp.status_code == 404:
            raise LookupError(path)
        if resp.status_code >= 400:
            raise OpenAlexError(f"OpenAlex returned {resp.status_code}")
        return resp.json()

    async def search_works(self, query: str, from_year: int, to_year: int, country: str | None, limit: int = 200) -> dict:
        """Most relevant journal articles matching `query`, newest years only."""
        filters = [f"publication_year:{from_year}-{to_year}", "type:article"]
        if country:
            filters.append(f"authorships.institutions.country_code:{country}")
        return await self._get(
            "/works",
            {
                "search": query,
                "filter": ",".join(filters),
                "sort": "relevance_score:desc",
                "per-page": str(limit),
                "select": WORK_FIELDS,
            },
        )

    async def get_author(self, author_id: str) -> dict:
        return await self._get(f"/authors/{author_id}", {})

    async def author_works(self, author_id: str, from_year: int, limit: int = 50) -> dict:
        return await self._get(
            "/works",
            {
                "filter": f"author.id:{author_id},publication_year:>{from_year - 1},type:article",
                "sort": "publication_date:desc",
                "per-page": str(limit),
                "select": WORK_FIELDS,
            },
        )
