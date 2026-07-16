# Advanced Automation Manager

Advanced Automation Manager (AAM) is a centralized fleet-control hub for Red Hat Ansible Automation Platform (AAP). It gives operators one place to register, observe, govern, search, and act on multiple AAP environments—the same way Red Hat Advanced Cluster Management centralizes OpenShift fleet operations.

Managed environments can run anywhere AAP is deployed today:

- RHEL hosts with containerized AAP via Podman
- OpenShift clusters
- Cloud estates on AWS, GCP, or Azure

AAM itself can be deployed as a Podman multi-container stack on RHEL or as an OpenShift Operator-managed operand.

## What the project does

AAM lets you:

- Register multiple AAP environments with connection data, credentials, and **infrastructure footprint** (Podman / OpenShift / AWS / GCP / Azure).
- Collect health and inventory from remote AAP services into one normalized hub.
- Review a fleet dashboard with health, compliance, resource coverage, and platform interface adoption.
- Review fleet monitoring across gateway, controller, EDA, and automation hub.
- **Watch live controller jobs across the fleet**, review running/pending/failed pressure, and **cancel active jobs** from one console.
- Search resources across every synced environment.
- Review topology, governance policies, and a unified activity stream.
- Trigger remote actions such as launching templates/workflows, syncing projects, toggling EDA activations, syncing hub repositories, and canceling jobs.

## Current stack

- `backend/`: FastAPI API, SQLAlchemy models, Alembic migrations, queue worker, scheduler, policy engine, and AAP connectors.
- `frontend/`: React 18 + Vite + **PatternFly React 6** console.
- `deploy/docker-compose.yml`: local/lab Docker Compose stack.
- `deploy/podman/`: Podman Compose + Quadlet units for RHEL.
- `deploy/operator/`: OpenShift Operator scaffold (`AAMInstance` CRD, RBAC, manager Deployment).
- `docs/architecture.md`: product and integration design.

## Key capabilities in the current build

- Fleet overview dashboard with high-level status, service health, compliance rollup, resource coverage, and interface adoption.
- Dedicated fleet monitoring page with common AAP monitoring points and collection-configuration coverage.
- **Fleet jobs page** with live stats and cancel actions across environments.
- Environment registry with modal registration, infrastructure type, create/update/delete/sync actions.
- Environment detail page with overview, monitoring, inventory, and settings tabs.
- Governance, activity, search, topology, and administration pages.

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

The backend exposes endpoints for:

- health checks (`GET /api/v1/healthz`)
- dashboard and monitoring summaries
- environment CRUD (including `deployment_type` and `infrastructure`)
- environment sync and topology
- fleet jobs (`GET /api/v1/jobs`, `GET /api/v1/jobs/stats`)
- policy definitions and results
- search, sync history, activity stream
- runtime settings
- remote actions (`POST /api/v1/actions`), including `cancel_job` for active controller jobs

Job listing accepts `status` values such as `running`, `failed`, or `active` (expands to running/pending/waiting). Cancel is performed through `POST /api/v1/actions` with `action: "cancel_job"` rather than a dedicated jobs cancel route.

The API is mounted at `/api/v1`. Swagger UI is available at `/docs`.

## Repository layout

```text
.
├── backend/
├── deploy/
│   ├── docker-compose.yml
│   ├── env/
│   ├── podman/
│   └── operator/
├── docs/
├── frontend/
└── README.md
```

## Requirements

For container-first usage:

- Docker Engine with Compose, **or Podman** with a Docker-compatible CLI/Compose setup
- enough memory/CPU for PostgreSQL, Redis, FastAPI, worker, scheduler, and UI

For local non-container development:

- Python 3.12+
- Node.js 22+
- npm 10+
- PostgreSQL 16+
- Redis 7+

## Quick start with containers

Docker:

```bash
docker compose -f deploy/docker-compose.yml up --build -d
```

Podman (RHEL):

```bash
podman compose -f deploy/podman/compose.yml up --build -d
```

Default endpoints:

- UI: `http://127.0.0.1:8080`
- API: `http://127.0.0.1:8000`
- API docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/api/v1/healthz`

See [deploy/podman/README.md](deploy/podman/README.md) and [deploy/operator/README.md](deploy/operator/README.md) for RHEL Quadlet and OpenShift Operator paths.

## Configuration

Compose uses [deploy/env/backend.env.example](deploy/env/backend.env.example).

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

- `AAM_CORS_ORIGINS` accepts comma-separated values or a JSON array.
- In `development`, the API auto-creates tables on startup.
- In `staging` / `production`, run Alembic migrations explicitly.
- `AAM_SECRET_KEY` must be replaced outside development.

## Database migrations

```bash
cd backend
alembic upgrade head
```

## Local development without containers

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Worker / scheduler:

```bash
python -m app.worker
python -m app.scheduler
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

## First-run usage flow

1. Open the UI.
2. Go to **Environments** and register an AAP environment (gateway URL, credentials, and infrastructure type).
3. Queue a sync.
4. Review **Monitoring** and **Jobs** for operational posture and live job control.
5. Open an environment detail page for inventory actions and settings.

## Platform access and RBAC

- Production deployments sit behind the AAP gateway or an equivalent trusted proxy.
- Roles: `aam.admin`, `aam.operator`, `aam.viewer`.

## Current limitations

- No committed automated test suite yet.
- Trusted-header authentication only (no standalone login UI).
- Compose/Podman configs target lab usage; harden secrets and TLS for production.
- OpenShift Operator scaffold provides CRD/RBAC/manager manifests; full reconciler packaging via Operator SDK is the next step.
- Cloud/OpenShift/Podman are first-class **registration and labeling** dimensions today; deeper cloud-account or cluster-API integrations can be layered on next.
- Job cancel targets controller jobs (`/api/controller/v2/jobs/{id}/cancel/`), not workflow or project update jobs.
- Existing development databases created before the infrastructure migration still need `alembic upgrade head` — `create_all` alone does not add new columns.

## Related documents

- [docs/architecture.md](docs/architecture.md)
- [deploy/podman/README.md](deploy/podman/README.md)
- [deploy/operator/README.md](deploy/operator/README.md)
- [backend/README.md](backend/README.md)
