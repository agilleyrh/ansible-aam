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

export const serviceLabels: Record<string, string> = {
  gateway: "Gateway",
  controller: "Controller",
  eda: "Event-Driven Ansible",
  hub: "Automation Hub",
  sync: "Environment sync",
};

export type MonitoringFinding = {
  environmentId: string;
  environmentName: string;
  service: string;
  severity: "warning" | "critical";
  title: string;
  reason: string;
  resolution: string;
  href: string;
  hrefLabel: string;
};

type FindingSource = {
  id: string;
  name: string;
  last_sync_error?: string | null;
  snapshots: ServiceSnapshot[];
};

function summaryString(summary: Record<string, unknown>, key: string): string | null {
  const value = summary[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function summarizeCollectionError(error: string): string {
  const status = error.match(/'(\d{3})\s+([^']+)'/);
  if (status) {
    return `HTTP ${status[1]} ${status[2]}`;
  }
  const first = error.split("\n")[0]?.trim() ?? error;
  return first.length > 180 ? `${first.slice(0, 177)}...` : first;
}

function defaultHref(environmentId: string, service: string, failedJobs: number): { href: string; hrefLabel: string } {
  if (service === "controller" && failedJobs > 0) {
    return {
      href: `/jobs?status=failed&environmentId=${encodeURIComponent(environmentId)}`,
      hrefLabel: "Review failed jobs",
    };
  }
  return {
    href: `/environments/${environmentId}`,
    hrefLabel: "Open environment",
  };
}

export function explainServiceHealth(environment: FindingSource, service: MonitoredService): MonitoringFinding | null {
  const snapshot = getSnapshot(environment.snapshots, service);
  const health = snapshot?.health ?? "not_configured";
  if (health === "healthy" || health === "not_configured") {
    return null;
  }

  const summary = snapshot?.summary ?? {};
  const label = serviceLabels[service] ?? service;
  const failedJobs = getNumericMetric(environment.snapshots, service, "failed_jobs_recent");
  const failedProjects = getNumericMetric(environment.snapshots, service, "failed_projects_recent");
  const activationCount = getNumericMetric(environment.snapshots, service, "activation_count");
  const repoCount = getNumericMetric(environment.snapshots, service, "repository_count");
  const collectionCount = getNumericMetric(environment.snapshots, service, "collection_count");
  const storedReason = summaryString(summary, "health_reason");
  const storedAction = summaryString(summary, "health_action");
  const error = summaryString(summary, "error");
  const severity: "warning" | "critical" = health === "critical" ? "critical" : "warning";

  if (error || health === "critical") {
    const summarized = error ? summarizeCollectionError(error) : `${label} collection failed`;
    const hubUnavailable = service === "hub" && /503/.test(summarized);
    return {
      environmentId: environment.id,
      environmentName: environment.name,
      service,
      severity,
      title: `${label} is unavailable`,
      reason: storedReason ?? `${label} collection failed (${summarized}).`,
      resolution:
        storedAction ??
        (hubUnavailable
          ? "Check that Automation Hub / galaxy is running in the AAP namespace, then sync this environment again."
          : `Confirm ${label} is running, the registered URL and credentials still work, then sync this environment again.`),
      href: `/environments/${environment.id}`,
      hrefLabel: "Open environment and sync",
    };
  }

  if (service === "controller" && (failedJobs >= 5 || failedProjects > 0)) {
    const parts: string[] = [];
    if (failedJobs >= 5) {
      parts.push(`${failedJobs} recent failed jobs`);
    }
    if (failedProjects > 0) {
      parts.push(`${failedProjects} project(s) in a failed or error state`);
    }
    return {
      environmentId: environment.id,
      environmentName: environment.name,
      service,
      severity,
      title: `${label} has recent failures`,
      reason: storedReason ?? `Controller is reachable, but ${parts.join(" and ")}.`,
      resolution:
        storedAction ??
        "Inspect the failed jobs, fix the template, inventory, or credentials in AAP, then re-run. Failed projects need a successful project update in Controller.",
      ...defaultHref(environment.id, service, failedJobs),
    };
  }

  if (service === "eda" && activationCount === 0) {
    return {
      environmentId: environment.id,
      environmentName: environment.name,
      service,
      severity,
      title: "No EDA activations",
      reason:
        storedReason ??
        "Event-Driven Ansible is reachable, but no rulebook activations were found, so it is not processing events.",
      resolution:
        storedAction ??
        "Create a rulebook activation in AAP if this environment should use EDA. If EDA is unused here, this warning is expected.",
      href: `/environments/${environment.id}`,
      hrefLabel: "Open environment",
    };
  }

  if (service === "hub" && repoCount === 0 && collectionCount === 0) {
    return {
      environmentId: environment.id,
      environmentName: environment.name,
      service,
      severity,
      title: "Automation Hub has no content",
      reason: storedReason ?? "Automation Hub responded, but returned no repositories or collections.",
      resolution:
        storedAction ??
        "Publish or sync collections in Hub, or ignore this if Hub is not used for content in this environment.",
      href: `/environments/${environment.id}`,
      hrefLabel: "Open environment",
    };
  }

  return {
    environmentId: environment.id,
    environmentName: environment.name,
    service,
    severity,
    title: `${label} needs attention`,
    reason: storedReason ?? `${label} health is ${humanize(health)}.`,
    resolution: storedAction ?? `Open the environment, review ${label} in AAP, then sync again.`,
    href: `/environments/${environment.id}`,
    hrefLabel: "Open environment",
  };
}

export function collectEnvironmentFindings(environment: FindingSource): MonitoringFinding[] {
  const findings: MonitoringFinding[] = [];
  if (environment.last_sync_error) {
    findings.push({
      environmentId: environment.id,
      environmentName: environment.name,
      service: "sync",
      severity: "critical",
      title: "Latest sync failed",
      reason: environment.last_sync_error,
      resolution: "Fix connectivity or credentials for this environment, then queue a new sync.",
      href: `/environments/${environment.id}`,
      hrefLabel: "Open environment and sync",
    });
  }
  for (const service of monitoredServices) {
    const finding = explainServiceHealth(environment, service);
    if (finding) {
      findings.push(finding);
    }
  }
  return findings;
}

export function collectMonitoringFindings(environments: FindingSource[]): MonitoringFinding[] {
  return environments.flatMap(collectEnvironmentFindings);
}
