import logging
import signal
import time

from app.config import get_settings
from app.database import SessionLocal, init_db, wait_for_db
from app.services.collector import enqueue_due_syncs
from app.services.policies import seed_default_policies

logger = logging.getLogger(__name__)
_running = True


def _shutdown_handler(signum: int, frame: object) -> None:
    global _running  # noqa: PLW0603
    logger.info("Received signal %s, shutting down scheduler", signum)
    _running = False


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    signal.signal(signal.SIGTERM, _shutdown_handler)
    signal.signal(signal.SIGINT, _shutdown_handler)

    settings = get_settings()
    wait_for_db()
    # Schema changes belong to the API (Alembic). Avoid create_all racing migrations.
    init_db(migrate=False)
    db = SessionLocal()
    try:
        seed_default_policies(db)
    finally:
        db.close()

    logger.info("Scheduler started")
    while _running:
        interval = settings.scheduler_interval_seconds
        try:
            db = SessionLocal()
            try:
                from app.services.hub_preferences import load_hub_preferences

                interval = load_hub_preferences(db).scheduler_interval_seconds
            finally:
                db.close()
            enqueue_due_syncs()
        except Exception:
            logger.exception("Error during sync scheduling cycle")
        time.sleep(max(interval, 15))


if __name__ == "__main__":
    main()

