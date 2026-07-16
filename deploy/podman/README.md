# Podman deployment (RHEL)

AAM is designed to run as a multi-container stack on RHEL with Podman (rootless or rootful). The Compose file in this directory is compatible with `podman compose` and the Docker-compatible CLI.

## Quick start

From the repository root:

```bash
podman compose -f deploy/podman/compose.yml up --build -d
podman compose -f deploy/podman/compose.yml ps
```

Endpoints:

- UI: `http://127.0.0.1:8080`
- API: `http://127.0.0.1:8000`
- Docs: `http://127.0.0.1:8000/docs`

Stop:

```bash
podman compose -f deploy/podman/compose.yml down
```

## Rootless Podman notes

```bash
systemctl --user enable --now podman.socket
```

If you are on WSL, use the WSL IP instead of Windows `localhost` when needed:

```bash
ip -4 addr show eth0
```

## Quadlet (systemd user units)

Optional Quadlet unit files live under `quadlet/`. Copy them into `~/.config/containers/systemd/` (rootless) or `/etc/containers/systemd/` (rootful), then:

```bash
systemctl --user daemon-reload
systemctl --user start aam-postgres aam-redis aam-api aam-worker aam-scheduler aam-ui
```

Adjust image names and volume paths in the Quadlet files to match your registry and host layout before enabling them in production.
