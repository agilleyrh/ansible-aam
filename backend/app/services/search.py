from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import ManagedEnvironment, ManagedResource
from app.schemas import SearchResult


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def run_search(db: Session, query: str) -> list[SearchResult]:
    settings = get_settings()
    escaped = _escape_like(query)
    results = db.execute(
        select(ManagedResource, ManagedEnvironment)
        .join(ManagedEnvironment, ManagedEnvironment.id == ManagedResource.environment_id)
        .where(
            or_(
                ManagedResource.name.ilike(f"%{escaped}%"),
                ManagedResource.resource_type.ilike(f"%{escaped}%"),
                ManagedResource.service.ilike(f"%{escaped}%"),
                ManagedResource.external_id.ilike(f"%{escaped}%"),
                ManagedEnvironment.name.ilike(f"%{escaped}%"),
            )
        )
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
