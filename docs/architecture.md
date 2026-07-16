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
| OpenShift | `deploy/operator/` (`AAMInstance` CRD + manager scaffold) |

## Major services

### API

- Accepts trusted user identity from platform gateway or Envoy.
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

## RBAC model

- Production mode expects AAP platform gateway or a trusted Envoy layer to forward user identity and roles.
- AAM maps gateway-oriented roles into three app roles:
  - `aam.admin`
  - `aam.operator`
  - `aam.viewer`
- The app can be hosted behind the existing platform gateway or behind a dedicated gateway instance that shares the same identity source.

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
- Complete the Operator SDK reconciler and OLM bundle for production OpenShift installs.
- Add gateway-native role definitions when AAP exposes the necessary extension hooks for third-party services.
