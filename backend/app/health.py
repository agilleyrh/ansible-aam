from fastapi.responses import JSONResponse
from redis import Redis
from sqlalchemy import text

from app.config import get_settings
from app.database import engine


def health_payload() -> tuple[dict[str, str], int]:
    settings = get_settings()
    checks: dict[str, str] = {}
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
    try:
        redis = Redis.from_url(settings.redis_url, socket_connect_timeout=2)
        redis.ping()
        checks["redis"] = "ok"
        redis.close()
    except Exception:
        checks["redis"] = "error"
    overall = "ok" if all(value == "ok" for value in checks.values()) else "degraded"
    status_code = 200 if overall == "ok" else 503
    return {"status": overall, **checks}, status_code


def health_response() -> JSONResponse:
    payload, status_code = health_payload()
    return JSONResponse(content=payload, status_code=status_code)
