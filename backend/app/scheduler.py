import time

from app.database import SessionLocal, init_db
from app.services.collector import enqueue_due_syncs
from app.services.policies import seed_default_policies


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        seed_default_policies(db)
    finally:
        db.close()

    while True:
        enqueue_due_syncs()
        time.sleep(60)


if __name__ == "__main__":
    main()

