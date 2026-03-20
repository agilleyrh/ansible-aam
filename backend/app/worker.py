from redis import Redis
from rq import Worker

from app.config import get_settings
from app.services.collector import SYNC_QUEUE_NAME


def main() -> None:
    redis = Redis.from_url(get_settings().redis_url)
    worker = Worker([SYNC_QUEUE_NAME], connection=redis)
    worker.work()


if __name__ == "__main__":
    main()
