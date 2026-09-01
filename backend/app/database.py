from datetime import datetime, timezone
import logging
from pathlib import Path
import time

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(
    settings.database_url,
    future=True,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def wait_for_db(*, attempts: int = 30, delay_seconds: float = 2.0) -> None:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            if attempt > 1:
                logger.info("Database became reachable on attempt %s", attempt)
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning("Waiting for database (attempt %s/%s): %s", attempt, attempts, exc)
            time.sleep(delay_seconds)
    raise RuntimeError(f"Database was not reachable after {attempts} attempts") from last_error


def _project_root() -> Path:
    candidates = [
        Path(__file__).resolve().parents[1],
        Path("/opt/app-root/src"),
        Path("/app"),
        Path.cwd(),
    ]
    for candidate in candidates:
        if (candidate / "alembic.ini").exists():
            return candidate
    raise RuntimeError("Could not locate alembic.ini; set the working directory to the backend root")


def _table_exists(name: str) -> bool:
    with engine.connect() as connection:
        if engine.dialect.name == "sqlite":
            row = connection.execute(
                text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:name"),
                {"name": name},
            ).fetchone()
            return row is not None
        return bool(
            connection.execute(
                text(
                    "SELECT EXISTS ("
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema = 'public' AND table_name = :name"
                    ")"
                ),
                {"name": name},
            ).scalar()
        )


def _alembic_config():
    from alembic.config import Config

    root = _project_root()
    alembic_cfg = Config(str(root / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(root / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
    return alembic_cfg


def run_migrations() -> None:
    from alembic import command

    alembic_cfg = _alembic_config()
    if _table_exists("managed_environments") and not _table_exists("alembic_version"):
        logger.warning(
            "Database schema already exists without Alembic history "
            "(likely SQLAlchemy create_all). Stamping the current head."
        )
        command.stamp(alembic_cfg, "head")
    logger.info("Applying database migrations from %s", alembic_cfg.config_file_name)
    try:
        command.upgrade(alembic_cfg, "head")
    except Exception:
        logger.exception("Database migration failed")
        raise


def init_db(*, migrate: bool = False) -> None:
    from app import models  # noqa: F401

    wait_for_db()
    sqlite = settings.database_url.startswith("sqlite") or "+pysqlite" in settings.database_url
    if migrate and settings.auto_migrate and not sqlite:
        run_migrations()
        return
    if sqlite:
        logger.info("Running create_all for SQLite")
        Base.metadata.create_all(bind=engine)
        return
    logger.info("Skipping schema bootstrap; the API process applies Alembic migrations")
