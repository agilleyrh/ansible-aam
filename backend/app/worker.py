from redis import Redis
from rq import Connection, Worker

from app.config import get_settings
from app.services.collector import SYNC_QUEUE_NAME


def main() -> None:
    redis = Redis.from_url(get_settings().redis_url)
    with Connection(redis):
        worker = Worker([SYNC_QUEUE_NAME])
        worker.work()


if __name__ == "__main__":
    main()

