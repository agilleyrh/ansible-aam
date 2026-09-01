# OpenShift / MicroShift install

This is the supported way to run Advanced Automation Manager on OpenShift, including a laptop CRC MicroShift cluster.

The Operator scaffold in `deploy/operator/` is a future packaging path. It does not deploy the hub by itself. Use these Kustomize manifests instead.

## What gets installed

Namespace `aam` with:

- PostgreSQL (OpenShift-compatible SCL image + 1Gi PVC)
- Redis (ephemeral job queue)
- `aam-api`, `aam-worker`, `aam-scheduler`
- `aam-ui` (nginx) with an OpenShift Route
- Lab identity headers so the UI works without an AAP gateway in front of AAM

## Laptop MicroShift (OpenShift Local)

This repository was verified against CRC MicroShift 4.22 (`*.apps.crc.testing`).

Prerequisites:

- `crc status` shows MicroShift running
- `oc` logged in (`oc whoami` should be `system:admin`)
- `podman` on the Mac/host for image builds

From the repository root:

```bash
./deploy/openshift/deploy.sh
```

The script:

1. Builds `localhost/aam-api:latest` and `localhost/aam-ui:latest` **inside the CRC VM** when CRC SSH is available (CRI-O and podman share that store). Otherwise it builds locally with podman and `podman load`s into the VM.
2. Applies `deploy/openshift/overlays/microshift` (`imagePullPolicy: Never`)

UI: `https://aam.apps.crc.testing`

If AAP is already on this cluster (for example `https://aap-aap-operator.apps.crc.testing`), register it in **Environments**. Leave controller, EDA, and hub URLs blank so collection uses the gateway origin (AAP 2.5+).

CRC/MicroShift cluster DNS does **not** resolve `*.apps.crc.testing` from inside pods. `deploy.sh` injects `hostAliases` so AAM can reach the AAP Route through `router-internal-default`. You can also register the in-cluster Service URL instead: `http://aap.aap-operator.svc`.

Useful flags:

```bash
SKIP_BUILD=1 ./deploy/openshift/deploy.sh   # reuse already-built images
SKIP_LOAD=1 ./deploy/openshift/deploy.sh    # manifests only
NAMESPACE=aam OVERLAY=microshift ./deploy/openshift/deploy.sh
```

## Verify

```bash
oc -n aam get pods
oc -n aam get route aam
curl -k https://aam.apps.crc.testing/api/v1/healthz
```

Expect every deployment Ready and health `{"status":"ok","database":"ok","redis":"ok"}`.

## Register AAP on the same cluster

1. Create a gateway token in AAP (or use OAuth client credentials).
2. In AAM **Environments**, set gateway URL to the Route or to `http://aap.aap-operator.svc`.
3. Leave controller / EDA / hub URLs blank on AAP 2.5+.
4. Disable SSL verification for the CRC certificate.
5. Sync. Controller and gateway should go healthy/warning. Automation Hub 503 on this laptop is typically hub pods Pending on PVC `aap-hub-file-storage`.

## Generic OpenShift

1. Build and push images to a registry the cluster can pull.
2. Add an overlay that rewrites `aam-api` and `aam-ui` (see `overlays/microshift` for the pattern; use a real registry and `IfNotPresent` or `Always`).
3. Apply:

```bash
oc apply -k deploy/openshift/base
```

Replace the default `secret-key` in Secret `aam` before any non-lab use. The UI Route host is omitted in the base so OpenShift can assign one. Postgres and Redis need the `anyuid` SCC bindings in `base/scc-binding.yaml`.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| API/worker exit 132 (SIGILL) on Apple Silicon CRC | Keep `OPENSSL_armcap=0` (image + ConfigMap). The guest advertises SVE2 that cryptography's OpenSSL would probe. |
| Alembic `source code string cannot contain null bytes` | Rebuild with `./deploy/openshift/deploy.sh` (sets `COPYFILE_DISABLE=1` so macOS tar does not ship `._*` files). |
| Sync error `Name or service not known` for `*.apps.crc.testing` | Re-run `deploy.sh` so host aliases are injected, or register `http://aap.aap-operator.svc`. |
| Redis CrashLoop `setpriv: setresuid failed` | The Redis Deployment must run `redis-server` as `command` (already in `base/redis.yaml`). |
| UI 401 | Lab overlay injects identity headers. Confirm UI env `AAM_DEFAULT_USER` / `AAM_DEFAULT_ROLES`. |
| No cluster image registry | Expected on CRC MicroShift. Build inside the VM (the script does this). |

## Uninstall

```bash
oc delete -k deploy/openshift/overlays/microshift
```
