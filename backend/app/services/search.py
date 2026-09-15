from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import ManagedEnvironment, ManagedResource
from app.schemas import SearchResult

SEARCH_ALIASES = {
    "ao": "orchestrator",
    "automation orchestrator": "orchestrator",
    "syntara": "orchestrator",
}


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _search_terms(query: str) -> list[str]:
    terms = [query]
    alias = SEARCH_ALIASES.get(query.strip().lower())
    if alias and alias not in terms:
        terms.append(alias)
    return terms


def run_search(db: Session, query: str) -> list[SearchResult]:
    settings = get_settings()
    filters = []
    for term in _search_terms(query):
        escaped = _escape_like(term)
        filters.extend(
            [
                ManagedResource.name.ilike(f"%{escaped}%", escape="\\"),
                ManagedResource.resource_type.ilike(f"%{escaped}%", escape="\\"),
                ManagedResource.service.ilike(f"%{escaped}%", escape="\\"),
                ManagedResource.external_id.ilike(f"%{escaped}%", escape="\\"),
                ManagedEnvironment.name.ilike(f"%{escaped}%", escape="\\"),
            ]
        )
    results = db.execute(
        select(ManagedResource, ManagedEnvironment)
        .join(ManagedEnvironment, ManagedEnvironment.id == ManagedResource.environment_id)
        .where(or_(*filters))
        .order_by(ManagedEnvironment.name, ManagedResource.service, ManagedResource.name)
        .limit(settings.search_result_limit)
    ).all()

    return [
        SearchResult(
            id=resource.id,
            environment_id=environment.id,
            environment_name=environment.name,
            service=resource.service,
            resource_type=resource.resource_type,
            name=resource.name,
            status=resource.status,
            url=resource.url,
            metadata=resource.metadata_json,
        )
        for resource, environment in results
    ]
