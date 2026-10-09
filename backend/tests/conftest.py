"""Shared pytest configuration.

Route-level tests need a real (but disposable) database so the FastAPI
lifespan can run migrations/seeding and routes can read and write through
`app.dependencies.get_db`. Point the app at a throwaway SQLite file before
any `app.*` module is imported, since `app.database` builds its engine from
`get_settings()` at import time.
"""

import os
import tempfile

_TEST_DB_PATH = os.path.join(tempfile.gettempdir(), "aam_test_routes.db")
# Start from a clean file each test session so seeded rows (built-in admin,
# default policies, hub preferences) are deterministic.
if os.path.exists(_TEST_DB_PATH):
    os.remove(_TEST_DB_PATH)

os.environ.setdefault("AAM_DATABASE_URL", f"sqlite:///{_TEST_DB_PATH}")
