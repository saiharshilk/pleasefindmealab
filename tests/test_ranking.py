from app.ranking import build_profile, rank_professors
from tests.helpers import authorship, work


def test_only_senior_and_corresponding_authors_get_credit():
    works = [
        work("Paper", 2026, 10, [
            authorship("A1", "Student", "first"),
            authorship("A2", "Postdoc", "middle"),
            authorship("A3", "Prof", "last"),
        ]),
    ]
    assert [p["name"] for p in rank_professors(works, 2026)] == ["Prof"]


def test_corresponding_author_counts_but_less_than_senior():
    works = [
        work("Paper", 2026, 10, [
            authorship("A1", "Corr", "first", corresponding=True),
            authorship("A3", "Prof", "last"),
        ]),
    ]
    ranked = rank_professors(works, 2026)
    assert [p["name"] for p in ranked] == ["Prof", "Corr"]
    assert ranked[1]["papers"][0]["role"] == "corresponding"


def test_single_author_paper_is_senior():
    ranked = rank_professors([work("Solo", 2026, 5, [authorship("A1", "Solo", "first")])], 2026)
    assert ranked[0]["papers"][0]["role"] == "senior"


def test_more_relevant_and_newer_work_ranks_higher():
    works = [
        work("Strong", 2026, 100, [authorship("A1", "Strong", "last")], "W1"),
        work("Weak", 2026, 10, [authorship("A2", "Weak", "last")], "W2"),
        work("Old", 2018, 100, [authorship("A3", "Old", "last")], "W3"),
    ]
    assert [p["name"] for p in rank_professors(works, 2026)] == ["Strong", "Old", "Weak"]


def test_scores_add_up_across_papers_and_keep_top_three_examples():
    works = [work(f"P{i}", 2026, 10, [authorship("A1", "Busy", "last")], f"W{i}") for i in range(5)]
    [prof] = rank_professors(works, 2026)
    assert prof["score"] == 5.0
    assert [p["title"] for p in prof["papers"]] == ["P0", "P1", "P2"]


def test_country_filter_ignores_foreign_lead_authors():
    # OpenAlex returns this paper for country=US because one co-author is in the US,
    # but the lab running it is in China.
    works = [
        work("Paper", 2026, 10, [
            authorship("A1", "US Student", "middle", country="US"),
            authorship("A2", "CN Prof", "last", country="CN"),
        ]),
    ]
    assert rank_professors(works, 2026, country="US") == []
    assert [p["name"] for p in rank_professors(works, 2026)] == ["CN Prof"]


def test_works_without_titles_or_author_ids_are_skipped():
    no_id = authorship("A1", "Ghost", "last")
    no_id["author"]["id"] = None
    works = [work(None, 2026, 10, [authorship("A2", "X", "last")]), work("T", 2026, 10, [no_id])]
    assert rank_professors(works, 2026) == []


def test_build_profile_counts_led_papers_and_collaborators():
    author = {
        "id": "https://openalex.org/A1",
        "display_name": "Prof",
        "orcid": "https://orcid.org/0000-0001",
        "last_known_institutions": [{"display_name": "Test University"}],
        "summary_stats": {"h_index": 12},
        "topics": [{"display_name": "Robots"}],
    }
    works = [
        work("Led 1", 2026, None, [authorship("A2", "Pal", "first"), authorship("A1", "Prof", "last")], "W1"),
        work("Led 2", 2025, None, [authorship("A2", "Pal", "first"), authorship("A1", "Prof", "last")], "W2"),
        work("Helped", 2025, None, [authorship("A1", "Prof", "middle"), authorship("A9", "Other", "last")], "W3"),
    ]
    p = build_profile(author, works, since_year=2024)
    assert p["id"] == "A1" and p["orcid"] == "0000-0001"
    assert (p["recent_papers_count"], p["recent_led_count"], p["leads_lab"]) == (3, 2, True)
    assert [x["role"] for x in p["papers"]] == ["senior", "senior", "middle"]
    # Only people seen on 2+ papers count as frequent collaborators.
    assert p["collaborators"] == [{"id": "A2", "name": "Pal", "institution": "Test University", "n": 2}]
