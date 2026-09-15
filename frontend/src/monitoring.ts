import { parseCapabilityProfile } from "./capabilities";
import type { EnvironmentDetail, MonitoringEnvironment, ServiceSnapshot } from "./types";
import { environmentKind, humanize } from "./utils";

export const aapMonitoredServices = ["gateway", "controller", "eda", "hub"] as const;
export const orchestratorMonitoredServices = ["orchestrator"] as const;
export const monitoredServices = [...aapMonitoredServices, ...orchestratorMonitoredServices] as const;

type MonitoredService = (typeof monitoredServices)[number];

export function monitoredServicesFor(value?: { kind?: string } | string | null): readonly MonitoredService[] {
  return environmentKind(value) === "orchestrator" ? orchestratorMonitoredServices : aapMonitoredServices;
}

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
  {
    id: "orchestrator",
    title: "Automation Orchestrator monitoring points",
    description: "Health, workflow, execution, integration, and approval signals from this Orchestrator estate.",
    points: [
      { label: "Orchestrator API", service: "orchestrator", key: "health", description: "Automation Orchestrator reachability." },
      { label: "Workflows", service: "orchestrator", key: "workflow_count", description: "Workflows defined in Orchestrator." },
      {
        label: "Enabled workflows",
        service: "orchestrator",
        key: "enabled_workflow_count",
        description: "Workflows currently enabled for execution.",
      },
      { label: "Executions", service: "orchestrator", key: "execution_count", description: "Workflow executions discovered." },
      {
        label: "Recent failed executions",
        service: "orchestrator",
        key: "failed_executions_recent",
        description: "Failed or errored executions in the latest sample.",
        tone: "danger",
      },
      {
        label: "Running executions",
        service: "orchestrator",
        key: "running_executions",
        description: "Executions currently running, pending, or paused.",
      },
      { label: "Projects", service: "orchestrator", key: "project_count", description: "Orchestrator projects." },
      { label: "Integrations", service: "orchestrator", key: "integration_count", description: "Configured Orchestrator integrations." },
      {
        label: "Unhealthy integrations",
        service: "orchestrator",
        key: "unhealthy_integration_count",
        description: "Integrations that failed validation.",
        tone: "warning",
      },
      {
        label: "Pending approvals",
        service: "orchestrator",
        key: "pending_approval_count",
        description: "Approval requests waiting on an operator.",
        tone: "warning",
      },
    ],
  },
];

export function monitoringPointGroupsFor(value?: { kind?: string } | string | null): MonitoringPointGroup[] {
  if (environmentKind(value) === "orchestrator") {
    return monitoringPointGroups.filter((group) => group.id === "orchestrator");
  }
  return monitoringPointGroups.filter((group) => group.id !== "orchestrator");
}

export function getSnapshot(snapshots: ServiceSnapshot[], service: string): ServiceSnapshot | undefined {
  return snapshots.find((snapshot) => snapshot.service === service);
}

export function getSnapshotHealth(snapshots: ServiceSnapshot[], service: string): string {
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

export function getCollectionProfile(record: MonitoringRecord & { kind?: string }): Array<{ label: string; value: string }> {
  const { profile } = parseCapabilityProfile(record.capabilities);
  if (environmentKind(record) === "orchestrator") {
    return [
      { label: "Product", value: "Automation Orchestrator" },
      { label: "Auth mode", value: humanize(record.auth_mode) },
      { label: "Verify TLS", value: record.verify_ssl ? "Enabled" : "Disabled" },
      { label: "Sync interval", value: `${record.sync_interval_minutes} minutes` },
    ];
  }
  return [
    { label: "Product", value: "Ansible Automation Platform" },
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
  orchestrator: "Automation Orchestrator",
  sync: "Environment sync",
  collector: "Collector",
};

export const resourceTypeLabels: Record<string, string> = {
  workflow: "Orchestrator workflow",
  execution: "Orchestrator execution",
  integration: "Orchestrator integration",
  workflow_job_template: "Controller workflow template",
  job_template: "Job template",
  running_job: "Controller job",
  activation: "EDA activation",
  repository: "Hub repository",
  collection: "Hub collection",
};

export function serviceLabel(service: string): string {
  return serviceLabels[service] ?? humanize(service);
}

export function resourceTypeLabel(resourceType: string): string {
  return resourceTypeLabels[resourceType] ?? humanize(resourceType);
}

export function compareServices(left: string, right: string): number {
  const leftRank = monitoredServices.indexOf(left as MonitoredService);
  const rightRank = monitoredServices.indexOf(right as MonitoredService);
  const leftOrder = leftRank === -1 ? 50 : leftRank;
  const rightOrder = rightRank === -1 ? 50 : rightRank;
  return leftOrder - rightOrder || left.localeCompare(right);
}

export function orderedServiceEntries<T>(services: Record<string, T>): Array<[string, T]> {
  return Object.entries(services).sort(([left], [right]) => compareServices(left, right));
}

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
  kind?: string;
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
  const failedExecutions = getNumericMetric(environment.snapshots, service, "failed_executions_recent");
  const unhealthyIntegrations = getNumericMetric(environment.snapshots, service, "unhealthy_integration_count");
  const workflowCount = getNumericMetric(environment.snapshots, service, "workflow_count");
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

  if (service === "orchestrator" && (failedExecutions > 0 || unhealthyIntegrations > 0 || workflowCount === 0)) {
    const parts: string[] = [];
    if (failedExecutions > 0) {
      parts.push(`${failedExecutions} recent failed workflow execution(s)`);
    }
    if (unhealthyIntegrations > 0) {
      parts.push(`${unhealthyIntegrations} integration(s) not available`);
    }
    if (workflowCount === 0) {
      parts.push("no workflows were returned");
    }
    return {
      environmentId: environment.id,
      environmentName: environment.name,
      service,
      severity,
      title: `${label} needs attention`,
      reason: storedReason ?? `Automation Orchestrator is reachable, but ${parts.join(" and ")}.`,
      resolution:
        storedAction ??
        "Open Automation Orchestrator to inspect failed executions, re-validate integrations, or publish a workflow.",
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
  for (const service of monitoredServicesFor(environment)) {
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
