import { parseCapabilityProfile } from "./capabilities";
import type { EnvironmentDetail, MonitoringEnvironment, ServiceSnapshot } from "./types";
import { humanize } from "./utils";

export const monitoredServices = ["gateway", "controller", "eda", "hub"] as const;

type MonitoredService = (typeof monitoredServices)[number];

export type MonitoringPoint = {
  label: string;
  service: MonitoredService;
  key: string;
  description: string;
  tone?: "danger" | "success" | "warning";
};

export type MonitoringPointGroup = {
  id: string;
  title: string;
  description: string;
  points: MonitoringPoint[];
};

export type MonitoringRecord = Pick<
  MonitoringEnvironment,
  "auth_mode" | "capabilities" | "snapshots" | "sync_interval_minutes" | "verify_ssl"
> |
  Pick<EnvironmentDetail, "auth_mode" | "capabilities" | "snapshots" | "sync_interval_minutes" | "verify_ssl">;

export const monitoringPointGroups: MonitoringPointGroup[] = [
  {
    id: "platform-services",
    title: "Platform services",
    description: "Availability of the core AAP entry points.",
    points: [
      { label: "Gateway API", service: "gateway", key: "health", description: "Platform gateway reachability." },
      { label: "Controller API", service: "controller", key: "health", description: "Automation controller reachability." },
      { label: "EDA API", service: "eda", key: "health", description: "Event-Driven Ansible reachability." },
      { label: "Automation Hub API", service: "hub", key: "health", description: "Automation hub reachability." },
    ],
  },
  {
    id: "controller",
    title: "Controller monitoring points",
    description: "Primary controller inventory, job, and execution signals.",
    points: [
      { label: "Jobs", service: "controller", key: "job_count", description: "Total jobs visible to the collector." },
      { label: "Job templates", service: "controller", key: "job_template_count", description: "Controller job templates." },
      {
        label: "Workflow templates",
        service: "controller",
        key: "workflow_job_template_count",
        description: "Workflow job templates exposed by controller.",
      },
      { label: "Inventories", service: "controller", key: "inventory_count", description: "Inventories available for automation." },
      { label: "Hosts", service: "controller", key: "host_count", description: "Hosts tracked in controller inventories." },
      { label: "Projects", service: "controller", key: "project_count", description: "Controller source projects." },
      {
        label: "Credentials",
        service: "controller",
        key: "credential_count",
        description: "Credential records available to the platform.",
      },
      {
        label: "Execution environments",
        service: "controller",
        key: "execution_environment_count",
        description: "Execution environment definitions discovered in controller.",
      },
      {
        label: "Recent failed jobs",
        service: "controller",
        key: "failed_jobs_recent",
        description: "Failed jobs returned by the recent jobs query.",
        tone: "danger",
      },
      {
        label: "Failed projects",
        service: "controller",
        key: "failed_projects_recent",
        description: "Projects currently reporting a failed or error state.",
        tone: "warning",
      },
    ],
  },
  {
    id: "eda",
    title: "EDA monitoring points",
    description: "Signals commonly used to review rulebook automation posture.",
    points: [
      { label: "Activations", service: "eda", key: "activation_count", description: "Rulebook activations discovered in EDA." },
      { label: "EDA projects", service: "eda", key: "project_count", description: "Projects registered in EDA." },
      {
        label: "Decision environments",
        service: "eda",
        key: "decision_environment_count",
        description: "Decision environments configured for rulebook execution.",
      },
      {
        label: "Disabled activations",
        service: "eda",
        key: "disabled_activations",
        description: "Rulebook activations currently disabled.",
        tone: "warning",
      },
    ],
  },
  {
    id: "hub",
    title: "Automation Hub monitoring points",
    description: "Content distribution and repository coverage across the hub.",
    points: [
      { label: "Repositories", service: "hub", key: "repository_count", description: "Repositories available for content sync." },
      { label: "Collections", service: "hub", key: "collection_count", description: "Collections surfaced by the hub search API." },
    ],
  },
];

export function getSnapshot(snapshots: ServiceSnapshot[], service: string): ServiceSnapshot | undefined {
  return snapshots.find((snapshot) => snapshot.service === service);
}

export function getSnapshotHealth(snapshots: ServiceSnapshot[], service: MonitoredService): string {
  return getSnapshot(snapshots, service)?.health ?? "not_configured";
}

export function getNumericMetric(snapshots: ServiceSnapshot[], service: string, key: string): number {
  const value = getSnapshot(snapshots, service)?.summary[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function getMonitoringValue(snapshots: ServiceSnapshot[], point: MonitoringPoint): string | number {
  if (point.key === "health") {
    return getSnapshotHealth(snapshots, point.service);
  }
  return getNumericMetric(snapshots, point.service, point.key);
}

export function formatMonitoringValue(point: MonitoringPoint, value: string | number): string {
  if (point.key === "health") {
    return humanize(String(value));
  }
  if (typeof value === "number") {
    return value.toLocaleString();
  }
  return String(value);
}

export function getServiceHealthMap(snapshots: ServiceSnapshot[]): Record<string, string> {
  return Object.fromEntries(monitoredServices.map((service) => [service, getSnapshotHealth(snapshots, service)]));
}

export function getHealthScore(summary: Record<string, unknown>): number {
  const value = summary.health_score;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function getCollectionProfile(record: MonitoringRecord): Array<{ label: string; value: string }> {
  const { profile } = parseCapabilityProfile(record.capabilities);
  return [
    { label: "Auth mode", value: humanize(record.auth_mode) },
    { label: "Verify TLS", value: record.verify_ssl ? "Enabled" : "Disabled" },
    { label: "Sync interval", value: `${record.sync_interval_minutes} minutes` },
    { label: "Management mode", value: humanize(profile.management_mode) },
    { label: "Gateway-only access", value: profile.gateway_enforced ? "Expected" : "Optional" },
    {
      label: "Metrics and reports",
      value: profile.metrics_enabled || profile.automation_reports_enabled ? "Declared" : "Not declared",
    },
  ];
}
