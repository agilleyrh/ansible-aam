# Architecture

## Product goal

Advanced Automation Manager is the fleet hub for Ansible Automation Platform. It manages multiple AAP environments the same way ACM manages multiple Kubernetes clusters:

- A hub service stores centralized inventory and health state.
- Remote AAP environments are registered as managed environments.
- Environments declare where they run: RHEL/Podman, OpenShift, AWS, GCP, Azure, or other.
- Policies evaluate fleet posture continuously.
- Operators can observe live jobs and cancel active controller work from the hub.
- The UI provides search, topology, compliance, job control, and operational summaries from one PatternFly console.

## ACM-to-AAM mapping

| ACM concept | AAM equivalent |
| --- | --- |
| Hub cluster | AAM hub services |
| Managed cluster | Managed AAP environment |
| Cluster sets | Environment groups |
| Governance policies | Automation governance policies |
| Search and topology | Cross-environment resource search and service topology |
| Observability | Health rollups, sync history, failure pressure, live job stats, and policy status |
| Multicluster actions | Cross-environment job launch/cancel, activation control, and repository sync |

## Deployment targets for the hub

| Target | Path |
| --- | --- |
| Lab / Docker | `deploy/docker-compose.yml` |
| RHEL / Podman | `deploy/podman/` (Compose + Quadlet) |
| OpenShift | `deploy/openshift/` (Kustomize + `deploy.sh` for CRC MicroShift) |

## Platform stack

The hub uses the same open-source building blocks as Ansible Automation Platform and OpenShift, packaged the way those products package them.

| Piece | Choice | Why |
| --- | --- | --- |
| API runtime | Python 3.12 on `ubi9/python-312` | UBI, same base family as AAP service images. |
| HTTP API | FastAPI, Uvicorn on the asyncio/h11 loop | Open-source service API. The portable loop avoids the Apple Silicon CRC OpenSSL probe. |
| UI | React and PatternFly 6, served by `ubi9/nginx-124` | PatternFly is the Red Hat console toolkit used by OpenShift and AAP. |
| Database | PostgreSQL 16, `quay.io/sclorg/postgresql-16-c9s` | Same Software Collections image OpenShift samples and AAP use. The client links the UBI `libpq` package rather than a bundled wheel. |
| Queue | Redis 7, `quay.io/sclorg/redis-7-c9s`, with RQ | Same image family. Redis is the broker; RQ is the worker library. |
| Schema | SQLAlchemy and Alembic | Versioned migrations, applied by the API on startup. |
| Passwords | Argon2id | Same local-password hash Automation Orchestrator uses. |
| Directory and SSO | OpenID Connect, LDAP, Active Directory | Same sign-in methods as AAP and Automation Orchestrator. |

RHEL customers can substitute `registry.redhat.io/rhel9/postgresql-16` and `registry.redhat.io/rhel9/redis-7`. Those are the entitled builds of the same sclorg images. Nothing in the hub is proprietary.

## Major services

### API

- Authenticates local accounts and optional OpenID Connect, LDAP, and Active Directory providers.
- Can optionally accept trusted identity headers from a platform gateway or Envoy. That path is off by default.
- Stores managed-environment inventory, infrastructure metadata, and normalized resource data.
- Exposes dashboard, environment, jobs, policy, search, topology, and action endpoints.

### Worker

- Pulls sync jobs from Redis.
- Connects to registered Controller, EDA, and Hub endpoints.
- Normalizes API responses into service summaries and managed-resource records, including running job samples.

### Scheduler

- Enqueues periodic sync jobs based on each environment's sync interval.
- Keeps fleet state fresh without requiring user interaction.

### PostgreSQL

- Stores durable environment definitions (including `deployment_type` and `infrastructure`).
- Stores resource inventory, policy results, sync execution history, and action audits.

### Redis

- Backs queueing for sync jobs.
- Supports ephemeral cache usage for dashboard-heavy requests if extended later.

## Data model

- `managed_environments`: remote AAP instances, URLs, auth mode, deployment type, infrastructure metadata, override paths, fleet metadata.
- `service_snapshots`: latest per-service health summary for gateway, controller, EDA, and hub.
- `managed_resources`: normalized search/topology inventory such as job templates, inventories, activations, projects, repositories, collections, and recent/running jobs.
- `policy_definitions`: governance policies modeled as rule documents.
- `policy_results`: latest compliance state per environment and policy.
- `sync_executions`: queue and execution history for inventory collection.
- `action_audits`: record of operator actions proxied from AAM into remote environments.
- `local_users`, `access_groups`, `group_memberships`: accounts and the groups that carry roles.
- `identity_providers`: OpenID Connect, LDAP, and Active Directory configuration. Secrets are encrypted with `AAM_SECRET_KEY`.
- `role_assignments`: system roles and per-environment roles for a user or a group. System scope stores an empty `environment_id`.

## RBAC model

Authorization follows Automation Orchestrator. Usage and provider configuration are in [authentication.md](authentication.md).

- System roles apply to the hub: `admin`, `auditor`, `user`, `authenticated`.
- Environment roles delegate the same idea onto one estate: `environment-admin`, `environment-user`, `environment-auditor`.
- Built-in groups `admins`, `auditors`, `users`, and `authenticated` hold the matching system role.
- Sessions are HMAC-signed cookies. Optional `x-rh-*` headers are accepted only when `AAM_TRUST_IDENTITY_HEADERS` is true.
- Older route checks still see implied `aam.admin`, `aam.operator`, and `aam.viewer` values derived from these roles.

## Integration model

### Controller

- Syncs health and inventory from the Controller API.
- Collects running/pending/failed job pressure.
- Supports central launch of job templates and workflows.
- Supports cancel of active jobs through the hub actions API.

### EDA

- Syncs activations, projects, and decision environments.
- Supports enable or disable actions for rulebook activations.

### Private Automation Hub

- Syncs repositories and collection inventory.
- Supports repository sync actions.

### Infrastructure footprint

Registration captures where an estate runs so the hub can filter and report consistently:

- `podman` — RHEL containerized AAP
- `openshift` — Operator/cluster-hosted AAP
- `aws` / `gcp` / `azure` — cloud-hosted AAP
- Optional region, cluster/project, account/subscription, and host/namespace metadata

## Extension points

- Add analytics ingestion from automation analytics or Event-Driven Ansible event streams.
- Add push-mode collectors or sidecar agents for heavily firewalled environments.
- Deepen OpenShift and cloud connectors beyond registration metadata (cluster API, cloud inventory).
- Complete the Operator SDK reconciler and OLM bundle if OperatorHub packaging is required. The hub already installs with Kustomize on OpenShift and MicroShift.

## Apple Silicon / CRC MicroShift

CRC guests on Apple Silicon advertise SVE2 CPU features that the hypervisor does not implement. `cryptography` 47+ probes those features at import and the API/worker/scheduler die with SIGILL (exit 132). The backend image, OpenShift ConfigMap, and `app/__init__.py` set `OPENSSL_armcap=0` so OpenSSL uses portable code. That env var is a no-op on x86_64.
- Add gateway-native role definitions when AAP exposes the necessary extension hooks for third-party services.
