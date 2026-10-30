def authorship(aid, name, position, country="US", inst="Test University", corresponding=False):
    return {
        "author_position": position,
        "author": {"id": f"https://openalex.org/{aid}", "display_name": name, "orcid": None},
        "institutions": [{"display_name": inst, "country_code": country}],
        "is_corresponding": corresponding,
    }


def work(title, year, relevance, authorships, wid="W1"):
    return {
        "id": f"https://openalex.org/{wid}",
        "title": title,
        "publication_year": year,
        "doi": f"https://doi.org/10.1/{wid}",
        "cited_by_count": 0,
        "relevance_score": relevance,
        "authorships": authorships,
        "primary_location": {"source": {"display_name": "Journal of Tests"}},
    }
