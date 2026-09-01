from redis import Redis
from rq import Worker

from app.config import get_settings
from app.database import wait_for_db
from app.services.collector import SYNC_QUEUE_NAME


def main() -> None:
    import logging

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logger = logging.getLogger(__name__)
    logger.info("Worker waiting for database")
    wait_for_db()
    logger.info("Worker connecting to Redis")
    redis = Redis.from_url(get_settings().redis_url)
    worker = Worker([SYNC_QUEUE_NAME], connection=redis)
    logger.info("Worker listening on queue %s", SYNC_QUEUE_NAME)
    worker.work()


if __name__ == "__main__":
    main()
