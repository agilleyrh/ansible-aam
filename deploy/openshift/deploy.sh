#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NAMESPACE="${NAMESPACE:-aam}"
OVERLAY="${OVERLAY:-microshift}"
API_IMAGE="${API_IMAGE:-localhost/aam-api:latest}"
UI_IMAGE="${UI_IMAGE:-localhost/aam-ui:latest}"
KUSTOMIZE_DIR="${ROOT}/deploy/openshift/overlays/${OVERLAY}"
CRC_SSH_KEY="${CRC_SSH_KEY:-${HOME}/.crc/machines/crc/id_ed25519}"
CRC_SSH_PORT="${CRC_SSH_PORT:-2222}"
CRC_SSH_USER="${CRC_SSH_USER:-core}"
CRC_SSH_HOST="${CRC_SSH_HOST:-127.0.0.1}"

log() {
  printf '==> %s\n' "$*"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

crc_ssh() {
  ssh -i "${CRC_SSH_KEY}" \
    -p "${CRC_SSH_PORT}" \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -o LogLevel=ERROR \
    "${CRC_SSH_USER}@${CRC_SSH_HOST}" "$@"
}

crc_available() {
  [[ -f "${CRC_SSH_KEY}" ]] && crc_ssh "true" >/dev/null 2>&1
}

sync_tree_to_crc() {
  local src="$1"
  local dest="$2"
  # macOS tar otherwise emits AppleDouble ._* files; Alembic then dies on null bytes.
  export COPYFILE_DISABLE=1
  crc_ssh "rm -rf '${dest}' && mkdir -p '${dest}'"
  tar -C "${src}" \
    --exclude '.venv' \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude '__pycache__' \
    --exclude '.pytest_cache' \
    --exclude '*.egg-info' \
    --exclude 'tests' \
    --exclude '._*' \
    --exclude '.DS_Store' \
    -cf - . | crc_ssh "tar -C '${dest}' -xf -"
}

build_on_crc() {
  log "Building images inside the MicroShift VM (CRI-O/podman store)"
  sync_tree_to_crc "${ROOT}/backend" /tmp/aam/backend
  sync_tree_to_crc "${ROOT}/frontend" /tmp/aam/frontend
  crc_ssh "sudo podman build -t '${API_IMAGE}' /tmp/aam/backend"
  crc_ssh "sudo podman build -t '${UI_IMAGE}' /tmp/aam/frontend"
}

need oc
[[ -d "${KUSTOMIZE_DIR}" ]] || die "Unknown overlay '${OVERLAY}'. Expected ${KUSTOMIZE_DIR}"
oc whoami >/dev/null 2>&1 || die "oc is not logged in. Check the current kubeconfig context."

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  if crc_available; then
    build_on_crc
  elif command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1; then
    log "Building API image ${API_IMAGE}"
    podman build -t "${API_IMAGE}" "${ROOT}/backend"
    log "Building UI image ${UI_IMAGE}"
    podman build -t "${UI_IMAGE}" "${ROOT}/frontend"
    if [[ -f "${CRC_SSH_KEY}" ]]; then
      log "Loading images into the MicroShift VM"
      podman save "${API_IMAGE}" | crc_ssh "sudo podman load"
      podman save "${UI_IMAGE}" | crc_ssh "sudo podman load"
    elif [[ -n "${IMAGE_REGISTRY:-}" ]]; then
      log "Pushing images to ${IMAGE_REGISTRY}"
      podman tag "${API_IMAGE}" "${IMAGE_REGISTRY}/aam-api:latest"
      podman tag "${UI_IMAGE}" "${IMAGE_REGISTRY}/aam-ui:latest"
      podman push "${IMAGE_REGISTRY}/aam-api:latest"
      podman push "${IMAGE_REGISTRY}/aam-ui:latest"
    else
      die "Images were built locally but neither CRC SSH nor IMAGE_REGISTRY is available."
    fi
  else
    die "Need CRC SSH access or a working local podman to build images."
  fi
fi

log "Applying ${KUSTOMIZE_DIR}"
oc apply -k "${KUSTOMIZE_DIR}"

inject_crc_route_host_aliases() {
  local router_ip hostnames=() host
  router_ip="$(oc -n openshift-ingress get svc router-internal-default -o jsonpath='{.spec.clusterIP}' 2>/dev/null || true)"
  [[ -n "${router_ip}" ]] || return 0
  host="$(oc -n "${NAMESPACE}" get route aam -o jsonpath='{.spec.host}' 2>/dev/null || true)"
  [[ -n "${host}" ]] && hostnames+=("${host}")
  host="$(oc -n aap-operator get route aap -o jsonpath='{.spec.host}' 2>/dev/null || true)"
  [[ -n "${host}" ]] && hostnames+=("${host}")
  [[ ${#hostnames[@]} -gt 0 ]] || return 0
  log "Adding in-cluster DNS aliases via router-internal-default (${router_ip})"
  local payload hosts_json=""
  local first=1
  for host in "${hostnames[@]}"; do
    if [[ "${first}" -eq 1 ]]; then
      hosts_json=$(printf '"%s"' "${host}")
      first=0
    else
      hosts_json=$(printf '%s,"%s"' "${hosts_json}" "${host}")
    fi
  done
  payload=$(printf '{"spec":{"template":{"spec":{"hostAliases":[{"ip":"%s","hostnames":[%s]}]}}}}' "${router_ip}" "${hosts_json}")
  local deploy
  for deploy in aam-api aam-worker aam-scheduler; do
    oc -n "${NAMESPACE}" patch deploy "${deploy}" --type merge -p "${payload}" >/dev/null
  done
}

inject_crc_route_host_aliases

log "Waiting for AAM deployments"
oc -n "${NAMESPACE}" rollout status deployment/aam-postgres --timeout=240s
oc -n "${NAMESPACE}" rollout status deployment/aam-redis --timeout=180s
oc -n "${NAMESPACE}" rollout status deployment/aam-api --timeout=240s
oc -n "${NAMESPACE}" rollout status deployment/aam-worker --timeout=240s
oc -n "${NAMESPACE}" rollout status deployment/aam-scheduler --timeout=240s
oc -n "${NAMESPACE}" rollout status deployment/aam-ui --timeout=240s

HOST="$(oc -n "${NAMESPACE}" get route aam -o jsonpath='{.spec.host}' 2>/dev/null || true)"
log "AAM is deployed in namespace ${NAMESPACE}"
if [[ -n "${HOST}" ]]; then
  log "UI: https://${HOST}"
  log "API docs: https://${HOST}/docs"
  log "Health: https://${HOST}/api/v1/healthz"
fi
