import logging
import signal
import time

from app.config import get_settings
from app.database import SessionLocal, init_db
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
    init_db()
    db = SessionLocal()
    try:
        seed_default_policies(db)
    finally:
        db.close()

    logger.info("Scheduler started with %ds interval", settings.scheduler_interval_seconds)
    while _running:
        try:
            enqueue_due_syncs()
        except Exception:
            logger.exception("Error during sync scheduling cycle")
        time.sleep(settings.scheduler_interval_seconds)


if __name__ == "__main__":
    main()

