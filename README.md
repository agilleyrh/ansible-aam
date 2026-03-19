# Advanced Automation Manager

Advanced Automation Manager (AAM) is a centralized fleet-control component for Red Hat Ansible Automation Platform 2.6. It is designed to manage multiple AAP environments from one place in the same way Red Hat Advanced Cluster Management provides centralized governance and observability for OpenShift clusters.

This repository delivers:

- A hub API for inventory, health, search, policy, and action relay across many AAP environments.
- A web console that follows the same general visual language as Ansible Automation Platform.
- Container deployment assets for API, worker, scheduler, PostgreSQL, Redis, and the UI.
- A gateway-aware RBAC model that expects trusted identity headers from the AAP platform gateway or an equivalent Envoy front door.

## Core design

- `backend/`: FastAPI service with PostgreSQL persistence, Redis-backed queueing, periodic sync, policy evaluation, and action relay into Controller, EDA, and Private Automation Hub.
- `frontend/`: React console for fleet overview, governance, topology, and cross-environment search.
- `deploy/docker-compose.yml`: Local or lab deployment topology.
- `docs/architecture.md`: Detailed product and integration design.

## Why this approach

AAM reuses the parts of AAP that matter operationally:

- Platform gateway remains the entry point for authentication and platform roles.
- Remote environments are registered with service-account or OAuth tokens issued from AAP-compatible identity flows.
- PostgreSQL stores durable fleet state and historical execution records.
- Redis backs task dispatch and can also serve as a short-lived cache layer for frequent dashboard reads.

## Local run

1. Copy `deploy/env/backend.env.example` into a local env file and adjust secrets.
2. Start the stack with `docker compose -f deploy/docker-compose.yml up --build`.
3. Open `http://localhost:8080`.

## Notes

- Default API paths for Controller, EDA, and Hub are included, but each environment can override endpoint paths per service.
- The Vite development server injects trusted headers for local testing. In production, route the UI through platform gateway or another trusted proxy that forwards the real identity and roles.
- This workspace did not have Python, Node, or Docker installed locally, so the implementation could not be executed here. The code and deployment assets were written for container-based verification.
