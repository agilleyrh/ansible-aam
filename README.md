# Advanced Automation Manager

Advanced Automation Manager (AAM) is a centralized fleet-control hub for Red Hat Ansible Automation Platform (AAP). It is designed to give operators one place to register, observe, govern, search, and act on multiple AAP environments in the same way Red Hat Advanced Cluster Management centralizes OpenShift fleet operations.

The current implementation is not a placeholder UI. It includes a working backend API, background worker and scheduler, persistent PostgreSQL storage, Redis-backed sync dispatch, and a PatternFly React console for day-to-day platform operations.

## What the project does

AAM lets you:

- Register multiple AAP environments with gateway, controller, EDA, and automation hub endpoints.
- Store environment metadata, ownership, labels, tags, groups, credentials, and service path overrides.
- Collect health and inventory from remote AAP services into one normalized hub.
- Review a fleet dashboard with health, compliance, activity, resource coverage, and platform integration adoption.
- Manage environment registration and edit structured capability declarations such as operator, Terraform, runner, receptor, content signing, Backstage, MCP, metrics, reports, and AI-assist expectations.
- Search resources across every synced environment from one console.
- Review topology relationships for services, resources, and declared platform integrations.
- Evaluate governance policies and review compliance results.
- Review a unified activity stream for syncs and operator actions.
- Trigger supported remote actions such as launching controller templates and workflows, syncing controller projects, toggling EDA activations, and syncing automation hub repositories.

## Current stack

- `backend/`: FastAPI API, SQLAlchemy models, Alembic migrations, queue worker, scheduler, policy engine, and service connectors.
- `frontend/`: React 18 + Vite + PatternFly React 5 console.
- `deploy/docker-compose.yml`: local/lab deployment for PostgreSQL, Redis, API, worker, scheduler, and UI.
- `docs/architecture.md`: product and integration design.

## Key capabilities in the current build

- Fleet overview dashboard with service health, compliance rollup, environment registry, resource coverage, and platform interface adoption.
- Environment registry with create, update, delete, and sync flows.
- Environment detail page with:
  - endpoint visibility
  - activity scoped to one environment
  - structured environment editing
  - capability profile review
  - service posture summaries
  - tracked inventory with direct actions
- Governance page for policy definitions and evaluation results.
- Fleet activity stream.
- Cross-environment search.
- Runtime settings page.
- Topology page for service and integration relationships.

## Architecture summary

AAM is built from six major runtime components:

- `aam-api`: FastAPI service exposing `/api/v1`.
- `aam-worker`: background sync worker.
- `aam-scheduler`: periodic sync scheduler.
- `postgres`: durable state for environments, resources, policies, activity, and sync history.
- `redis`: queue backend for sync execution.
- `aam-ui`: nginx-served React/PatternFly frontend.

More detail is in [docs/architecture.md](docs/architecture.md).

## API surface

The backend currently exposes endpoints for:

- health checks
- dashboard summaries
- environment CRUD
- environment sync requests
- environment topology
- policy definitions
- policy results
- search
- sync execution history
- unified activity stream
- runtime settings
- remote action execution

The API is mounted at `/api/v1`, and Swagger UI is available at `/docs`.

## UI design state

The frontend now uses installed PatternFly React components directly instead of relying on custom HTML and class names to imitate PatternFly. PatternFly base CSS is imported from the local package, and the remaining custom CSS is limited to app-specific layout and visual adjustments.

## Repository layout

```text
.
├── backend/
│   ├── alembic/
│   ├── app/
│   ├── Dockerfile
│   └── pyproject.toml
├── deploy/
│   ├── docker-compose.yml
│   └── env/
├── docs/
│   └── architecture.md
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   ├── package.json
│   └── package-lock.json
└── README.md
```

## Requirements

For container-first usage:

- Docker Engine with Compose, or Podman with a Docker-compatible CLI/Compose setup
- enough memory/CPU for PostgreSQL, Redis, FastAPI, worker, scheduler, and a Vite frontend build

For local non-container development:

- Python 3.12+
- Node.js 22+
- npm 10+
- PostgreSQL 16+
- Redis 7+

## Quick start with containers

Run these commands from the repository root:

```bash
docker compose -f deploy/docker-compose.yml up --build -d
docker compose -f deploy/docker-compose.yml ps
```

Default service endpoints:

- UI: `http://127.0.0.1:8080`
- API: `http://127.0.0.1:8000`
- API docs: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/api/v1/healthz`

To stop the stack:

```bash
docker compose -f deploy/docker-compose.yml down
```

To stop the stack and remove the PostgreSQL volume:

```bash
docker compose -f deploy/docker-compose.yml down -v
```

## Configuration

The compose file currently points directly at [deploy/env/backend.env.example](deploy/env/backend.env.example).

Important settings:

- `AAM_ENVIRONMENT`
- `AAM_DATABASE_URL`
- `AAM_REDIS_URL`
- `AAM_SECRET_KEY`
- `AAM_CORS_ORIGINS`
- `AAM_GATEWAY_TRUSTED_PROXY`
- `AAM_ALLOW_DEV_BYPASS`
- `AAM_DEFAULT_SYNC_INTERVAL_MINUTES`
- `AAM_SYNC_JOB_TIMEOUT_MINUTES`
- `AAM_SCHEDULER_INTERVAL_SECONDS`

Notes:

- `AAM_CORS_ORIGINS` accepts either comma-separated values or a JSON array.
- In `development`, the API auto-creates tables on startup.
- In `staging` and `production`, `create_all` is skipped and you should run Alembic migrations explicitly.
- `AAM_SECRET_KEY` must be replaced with a strong random value outside development.

## Database migrations

Alembic is included under [backend/alembic](backend/alembic).

For staging/production-style runs:

```bash
cd backend
alembic upgrade head
```

Current behavior:

- `development`: automatic `create_all`
- `staging` / `production`: run `alembic upgrade head`

## Local development without containers

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"
```

Set environment variables before running the API, worker, and scheduler. Example:

```bash
export AAM_ENVIRONMENT=development
export AAM_DATABASE_URL=postgresql+psycopg://aam:aam@localhost:5432/aam
export AAM_REDIS_URL=redis://localhost:6379/0
export AAM_SECRET_KEY=replace-with-a-real-secret
export AAM_CORS_ORIGINS=http://localhost:5173,http://localhost:8080
export AAM_GATEWAY_TRUSTED_PROXY=true
export AAM_ALLOW_DEV_BYPASS=true
```

Run the API:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Run the worker in another shell:

```bash
python -m app.worker
```

Run the scheduler in another shell:

```bash
python -m app.scheduler
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

The Vite dev server runs on `http://127.0.0.1:5173` by default.

The frontend automatically injects trusted development headers when running under Vite dev mode. That is only for local development. In a real deployment, place the UI/API behind the AAP platform gateway or another trusted proxy that forwards identity and roles.

## Build instructions for other systems

### Container build

Backend image:

```bash
docker build -t deploy-aam-api backend
```

Frontend image:

```bash
docker build -t deploy-aam-ui frontend
```

### Frontend build only

If Node.js is installed locally:

```bash
cd frontend
npm ci
npm run build
```

If Node.js is not installed locally, you can still validate the frontend build with a disposable container:

```bash
docker run --rm -v "$PWD/frontend:/app" -w /app node:22-alpine npm ci
docker run --rm -v "$PWD/frontend:/app" -w /app node:22-alpine npm run build
```

### Backend package install

```bash
cd backend
pip install -e ".[dev]"
```

## Validation and test guidance

There are currently no committed automated test files in this repository. At the moment, validation is build- and smoke-test-oriented.

Recommended validation steps:

### Frontend

```bash
cd frontend
npm ci
npm run build
```

### Backend

```bash
python3 -m compileall backend/app backend/alembic
```

### Full stack smoke test

```bash
docker compose -f deploy/docker-compose.yml up --build -d
docker compose -f deploy/docker-compose.yml ps
curl http://127.0.0.1:8000/api/v1/healthz
curl -I http://127.0.0.1:8080
```

The health response should look like:

```json
{"status":"ok","database":"ok","redis":"ok"}
```

## First-run usage flow

After the stack is up:

1. Open the UI.
2. Go to `Environments`.
3. Register an AAP environment with at least a gateway URL and any available controller, EDA, or hub endpoints.
4. Save the environment and queue a sync.
5. Review dashboard health, environment detail, activity, governance, search, and topology after collection completes.

## Platform access and RBAC assumptions

- Production deployments are expected to sit behind the AAP gateway or an equivalent trusted proxy.
- The backend consumes trusted identity headers rather than owning a standalone user database.
- The role model is aligned to:
  - `aam.admin`
  - `aam.operator`
  - `aam.viewer`

## Windows, WSL, and Podman notes

If you run the stack inside WSL with rootless Podman and use the Docker-compatible CLI:

- the app may be reachable inside WSL on `127.0.0.1`
- Windows `127.0.0.1` may not forward automatically
- you may need to open the UI and API using the current WSL IP instead

To get the current WSL IP:

```bash
ip -4 addr show eth0
```

If Podman’s user socket is missing:

```bash
systemctl --user enable --now podman.socket
```

On Docker Desktop or a standard Linux Docker setup, plain `localhost` access is typically enough.

## Current limitations

- No committed automated test suite yet.
- The project currently assumes trusted-header authentication instead of shipping a standalone auth system.
- The compose configuration is aimed at local/lab usage, not a hardened production deployment.
- Rootless Podman under WSL may require using the WSL IP instead of Windows `localhost`.

## Related documents

- [docs/architecture.md](docs/architecture.md)
- [backend/README.md](backend/README.md)
