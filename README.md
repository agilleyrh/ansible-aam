# Advanced Automation Manager

Advanced Automation Manager (AAM) is a centralized fleet-control hub for Red Hat Ansible Automation Platform (AAP). It gives operators one place to register, observe, govern, search, and act on multiple AAP environments—the same way Red Hat Advanced Cluster Management centralizes OpenShift fleet operations.

Managed environments can run anywhere AAP is deployed today:

- RHEL hosts with containerized AAP via Podman
- OpenShift clusters
- Cloud estates on AWS, GCP, or Azure

AAM itself can be deployed as a Podman multi-container stack on RHEL or as an OpenShift workload via Kustomize (including CRC MicroShift on a laptop).

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
- `deploy/openshift/`: **installable** OpenShift / MicroShift Kustomize manifests and a laptop deploy script.
- `deploy/operator/`: optional future Operator SDK scaffold. It does not install the hub by itself.
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
│   ├── openshift/
│   ├── podman/
│   └── operator/
├── docs/
├── frontend/
└── README.md
```

## Deploy

Choose one install path. OpenShift / CRC MicroShift is the path verified on a laptop. Compose and Podman remain available for local lab stacks.

### 1. CRC MicroShift (OpenShift Local)

Verified against CRC MicroShift 4.22 (`*.apps.crc.testing`). Full notes: [deploy/openshift/README.md](deploy/openshift/README.md).

**Prerequisites**

- MicroShift running: `crc status`
- `oc` logged in (`oc whoami` should be `system:admin`)
- CRC SSH key at `~/.crc/machines/crc/id_ed25519` (the script builds images inside the VM because CRC has no internal image registry)

From the repository root:

```bash
./deploy/openshift/deploy.sh
```

The script builds `localhost/aam-api:latest` and `localhost/aam-ui:latest` in the CRC VM, applies `deploy/openshift/overlays/microshift`, waits for rollouts, and injects `hostAliases` so AAM pods can reach OpenShift Routes (`*.apps.crc.testing` is not in cluster DNS).

**Confirm the install**

```bash
oc -n aam get pods
curl -k https://aam.apps.crc.testing/api/v1/healthz
```

- UI: `https://aam.apps.crc.testing` (accept the CRC certificate)
- API docs: `https://aam.apps.crc.testing/docs`
- Health: `{"status":"ok","database":"ok","redis":"ok"}`

Lab UI nginx injects `X-RH-User` / `X-RH-Roles` so you can use the console without putting AAP gateway in front of AAM.

**Register an AAP environment**

1. Open **Environments** and create an environment.
2. On AAP 2.5+, set **Gateway URL** only. Leave controller, EDA, and hub blank so collection uses that same origin.
3. Auth: paste a gateway token (`service_account`) or OAuth client id/secret (`oauth2`).
4. For CRC self-signed certificates, turn **Verify SSL** off.
5. Save and sync.

Same-cluster AAP on this laptop:

- Public route: `https://aap-aap-operator.apps.crc.testing` (works after `deploy.sh` host aliases)
- In-cluster Service: `http://aap.aap-operator.svc` (works even without host aliases)

Reuse images or apply manifests only:

```bash
SKIP_BUILD=1 ./deploy/openshift/deploy.sh
SKIP_LOAD=1 ./deploy/openshift/deploy.sh
```

Uninstall:

```bash
oc delete -k deploy/openshift/overlays/microshift
```

### 2. Generic OpenShift

1. Build and push `aam-api` and `aam-ui` to a registry the cluster can pull.
2. Add an overlay (or edit `deploy/openshift/base`) that rewrites those image names. Do not use `imagePullPolicy: Never` unless the images are already on every node.
3. Replace `secret-key` in Secret `aam` before any non-lab use.
4. Apply:

```bash
oc apply -k deploy/openshift/base
```

The base Route has no host so OpenShift can assign one. Postgres and Redis ServiceAccounts are bound to `anyuid` SCC.

### 3. Docker Compose or Podman

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

Quadlet units: [deploy/podman/README.md](deploy/podman/README.md).

## Requirements

Container / cluster:

- Docker Compose, **or** Podman Compose, **or** OpenShift / CRC MicroShift with `oc`
- enough memory/CPU for PostgreSQL, Redis, API, worker, scheduler, and UI

Local non-container development:

- Python 3.12+
- Node.js 22+
- npm 10+
- PostgreSQL 16+
- Redis 7+

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
- `AAM_AUTO_MIGRATE`
- `AAM_DEFAULT_SYNC_INTERVAL_MINUTES`
- `AAM_SYNC_JOB_TIMEOUT_MINUTES`
- `AAM_SCHEDULER_INTERVAL_SECONDS`

Notes:

- `AAM_CORS_ORIGINS` accepts comma-separated values or a JSON array.
- OpenShift and Compose set `AAM_AUTO_MIGRATE=true`; the API runs Alembic on startup. SQLite still uses `create_all`.
- `AAM_SECRET_KEY` must be replaced outside development.
- `OPENSSL_armcap=0` is set for Apple Silicon CRC/MicroShift guests (see limitations).

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
pytest
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

1. Open the UI (`https://aam.apps.crc.testing` on CRC, or `http://127.0.0.1:8080` on Compose).
2. Go to **Environments** and register an AAP environment (gateway URL, credentials, infrastructure type).
3. Queue a sync. Gateway, controller, EDA, and hub should appear under monitoring; Hub 503 usually means the remote Automation Hub PVC/pods are unhealthy, not AAM.
4. Review **Dashboard**, **Jobs**, **Topology**, and **Policies**.
5. Open an environment detail page for inventory actions and settings.

## Platform access and RBAC

- Production deployments sit behind the AAP gateway or an equivalent trusted proxy.
- Roles: `aam.admin`, `aam.operator`, `aam.viewer`.

## Current limitations

- Trusted-header authentication only (no standalone login UI). Lab installs inject identity headers at the UI proxy.
- Compose/Podman configs target lab usage; harden secrets and TLS for production.
- OpenShift Operator scaffold provides CRD/RBAC/manager manifests; use `deploy/openshift` to install the hub. Full Operator SDK reconciler packaging remains a later step.
- Cloud/OpenShift/Podman are first-class **registration and labeling** dimensions today; deeper cloud-account or cluster-API integrations can be layered on next.
- Job cancel targets controller jobs (`/api/controller/v2/jobs/{id}/cancel/`), not workflow or project update jobs.
- Existing development databases created before the infrastructure migration still need `alembic upgrade head` — `create_all` alone does not add new columns.
- On Apple Silicon CRC/MicroShift, keep `OPENSSL_armcap=0` (image and ConfigMap default). The guest advertises SVE2 that cryptography's bundled OpenSSL would otherwise probe, crashing Python with SIGILL.

## Related documents

- [docs/architecture.md](docs/architecture.md)
- [deploy/podman/README.md](deploy/podman/README.md)
- [deploy/openshift/README.md](deploy/openshift/README.md)
- [backend/README.md](backend/README.md)
