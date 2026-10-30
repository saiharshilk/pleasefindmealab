"""Turn raw OpenAlex works into ranked professors. Pure functions, no I/O.

Who counts as "running the lab" on a paper: the last author (the usual senior
position in science and engineering) or the corresponding author. First and
middle authors are mostly students and postdocs, so they get no credit.
"""

from collections import Counter
from typing import Any

SENIOR_WEIGHT = 1.0
CORRESPONDING_WEIGHT = 0.8
# Each year older than the newest year in the window is worth this much less.
RECENCY_DECAY = 0.85
PAPERS_PER_PROFESSOR = 3
MAX_PROFESSORS = 100


def short_id(url: str | None) -> str | None:
    """'https://openalex.org/A123' -> 'A123'; also strips orcid.org URLs."""
    if not url:
        return None
    return url.rstrip("/").rsplit("/", 1)[-1]


def author_role(authorship: dict, n_authors: int) -> str:
    position = authorship.get("author_position")
    if position == "last" or n_authors == 1:
        return "senior"
    if position == "first":
        return "first"
    return "middle"


def _venue(work: dict) -> str | None:
    source = (work.get("primary_location") or {}).get("source") or {}
    return source.get("display_name")


def _paper(work: dict, role: str) -> dict:
    return {
        "title": work["title"],
        "year": work.get("publication_year"),
        "cited": work.get("cited_by_count", 0),
        "doi": work.get("doi"),
        "venue": _venue(work),
        "role": role,
    }


def _in_country(authorship: dict, country: str | None) -> bool:
    if not country:
        return True
    return any(i.get("country_code") == country for i in authorship.get("institutions") or [])


def rank_professors(works: list[dict], to_year: int, country: str | None = None) -> list[dict]:
    """Group relevance-sorted works by lead author and rank the authors.

    A paper's credit is its relevance (relative to the best match) times a
    recency factor, times the author's role weight. When `country` is set, only
    authors based in that country get credit: the OpenAlex country filter
    matches a paper if *any* author is there, which would otherwise surface
    foreign PIs who had one US co-author.
    """
    works = [w for w in works if w.get("title")]
    if not works:
        return []
    top_relevance = max((w.get("relevance_score") or 0) for w in works) or 1.0

    profs: dict[str, dict[str, Any]] = {}
    for work in works:
        relevance = (work.get("relevance_score") or 0) / top_relevance
        age = max(0, to_year - (work.get("publication_year") or to_year))
        paper_weight = relevance * RECENCY_DECAY**age
        authorships = work.get("authorships") or []

        for a in authorships:
            author = a.get("author") or {}
            aid = short_id(author.get("id"))
            if not aid or not _in_country(a, country):
                continue
            role = author_role(a, len(authorships))
            if role == "senior":
                weight = SENIOR_WEIGHT
            elif a.get("is_corresponding"):
                weight = CORRESPONDING_WEIGHT
            else:
                continue

            prof = profs.get(aid)
            if prof is None:
                inst = (a.get("institutions") or [{}])[0]
                prof = profs[aid] = {
                    "id": aid,
                    "name": author.get("display_name"),
                    "institution": inst.get("display_name"),
                    "country": inst.get("country_code"),
                    "orcid": short_id(author.get("orcid")),
                    "score": 0.0,
                    "latest_year": None,
                    "papers": [],
                }
            prof["score"] += weight * paper_weight
            year = work.get("publication_year")
            if year and (prof["latest_year"] is None or year > prof["latest_year"]):
                prof["latest_year"] = year
            # Works arrive most-relevant first, so the first few are the best examples.
            if len(prof["papers"]) < PAPERS_PER_PROFESSOR:
                prof["papers"].append(_paper(work, role if role == "senior" else "corresponding"))

    ranked = sorted(profs.values(), key=lambda p: (-p["score"], p["name"] or ""))
    for p in ranked:
        p["score"] = round(p["score"], 2)
    return ranked[:MAX_PROFESSORS]


def build_profile(author: dict, works: list[dict], since_year: int) -> dict:
    """Professor page: who they are, what they published lately, who they work with."""
    aid = short_id(author.get("id"))
    papers = []
    led = 0
    collaborators: Counter[str] = Counter()
    collab_info: dict[str, dict] = {}
    recent_count = 0

    for work in works:
        if not work.get("title"):
            continue
        authorships = work.get("authorships") or []
        mine = next((a for a in authorships if short_id((a.get("author") or {}).get("id")) == aid), None)
        if mine is None:
            continue
        role = author_role(mine, len(authorships))
        if role != "senior" and mine.get("is_corresponding"):
            role = "corresponding"
        if (work.get("publication_year") or 0) >= since_year:
            recent_count += 1
            if role in ("senior", "corresponding"):
                led += 1
        papers.append(_paper(work, role))

        for a in authorships:
            other = a.get("author") or {}
            oid = short_id(other.get("id"))
            if not oid or oid == aid:
                continue
            collaborators[oid] += 1
            if oid not in collab_info:
                collab_info[oid] = {
                    "id": oid,
                    "name": other.get("display_name"),
                    "institution": ((a.get("institutions") or [{}])[0]).get("display_name"),
                }

    top_collaborators = [
        {**collab_info[oid], "n": n} for oid, n in collaborators.most_common(8) if n >= 2
    ]
    return {
        "id": aid,
        "name": author.get("display_name"),
        "orcid": short_id(author.get("orcid")),
        "institutions": [i["display_name"] for i in author.get("last_known_institutions") or [] if i.get("display_name")],
        "h_index": (author.get("summary_stats") or {}).get("h_index"),
        "works_count": author.get("works_count"),
        "cited_by_count": author.get("cited_by_count"),
        "topics": [t["display_name"] for t in (author.get("topics") or [])[:6]],
        "papers_since": since_year,
        "recent_papers_count": recent_count,
        "recent_led_count": led,
        "leads_lab": led >= 2,
        "papers": papers[:15],
        "collaborators": top_collaborators,
    }
