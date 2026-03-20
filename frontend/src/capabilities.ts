export type ManagementMode = "manual" | "operator" | "terraform" | "collection";

export type CapabilityProfile = {
  management_mode: ManagementMode;
  operator_namespace: string;
  cluster_namespace: string;
  terraform_workspace: string;
  backstage_entity_ref: string;
  mcp_endpoint: string;
  runner_enabled: boolean;
  builder_pipeline_enabled: boolean;
  receptor_mesh_enabled: boolean;
  receptor_node_count: number | null;
  execution_environments_expected: boolean;
  remote_execution_expected: boolean;
  content_signing_enabled: boolean;
  content_signing_expected: boolean;
  gateway_enforced: boolean;
  developer_portal_expected: boolean;
  mcp_expected: boolean;
  metrics_enabled: boolean;
  automation_reports_enabled: boolean;
  ai_assistant_enabled: boolean;
};

export const knownCapabilityKeys = [
  "management_mode",
  "operator_namespace",
  "cluster_namespace",
  "terraform_workspace",
  "backstage_entity_ref",
  "mcp_endpoint",
  "runner_enabled",
  "builder_pipeline_enabled",
  "receptor_mesh_enabled",
  "receptor_node_count",
  "execution_environments_expected",
  "remote_execution_expected",
  "content_signing_enabled",
  "content_signing_expected",
  "gateway_enforced",
  "developer_portal_expected",
  "mcp_expected",
  "metrics_enabled",
  "automation_reports_enabled",
  "ai_assistant_enabled",
];

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseCapabilityProfile(capabilities: Record<string, unknown> | null | undefined): {
  profile: CapabilityProfile;
  extraCapabilities: Record<string, unknown>;
} {
  const source = capabilities ?? {};
  const extraCapabilities: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!knownCapabilityKeys.includes(key)) {
      extraCapabilities[key] = value;
    }
  }

  return {
    profile: {
      management_mode: (source.management_mode as ManagementMode) ?? "manual",
      operator_namespace: asString(source.operator_namespace),
      cluster_namespace: asString(source.cluster_namespace),
      terraform_workspace: asString(source.terraform_workspace),
      backstage_entity_ref: asString(source.backstage_entity_ref),
      mcp_endpoint: asString(source.mcp_endpoint),
      runner_enabled: asBoolean(source.runner_enabled),
      builder_pipeline_enabled: asBoolean(source.builder_pipeline_enabled),
      receptor_mesh_enabled: asBoolean(source.receptor_mesh_enabled),
      receptor_node_count: asNumber(source.receptor_node_count),
      execution_environments_expected: asBoolean(source.execution_environments_expected),
      remote_execution_expected: asBoolean(source.remote_execution_expected),
      content_signing_enabled: asBoolean(source.content_signing_enabled),
      content_signing_expected: asBoolean(source.content_signing_expected),
      gateway_enforced: asBoolean(source.gateway_enforced),
      developer_portal_expected: asBoolean(source.developer_portal_expected),
      mcp_expected: asBoolean(source.mcp_expected),
      metrics_enabled: asBoolean(source.metrics_enabled),
      automation_reports_enabled: asBoolean(source.automation_reports_enabled),
      ai_assistant_enabled: asBoolean(source.ai_assistant_enabled),
    },
    extraCapabilities,
  };
}

export function buildCapabilities(profile: CapabilityProfile, extraCapabilities: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...extraCapabilities,
    management_mode: profile.management_mode,
  };

  const stringFields: Array<keyof CapabilityProfile> = [
    "operator_namespace",
    "cluster_namespace",
    "terraform_workspace",
    "backstage_entity_ref",
    "mcp_endpoint",
  ];
  for (const key of stringFields) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) {
      merged[key] = value.trim();
    } else {
      delete merged[key];
    }
  }

  const booleanFields: Array<keyof CapabilityProfile> = [
    "runner_enabled",
    "builder_pipeline_enabled",
    "receptor_mesh_enabled",
    "execution_environments_expected",
    "remote_execution_expected",
    "content_signing_enabled",
    "content_signing_expected",
    "gateway_enforced",
    "developer_portal_expected",
    "mcp_expected",
    "metrics_enabled",
    "automation_reports_enabled",
    "ai_assistant_enabled",
  ];
  for (const key of booleanFields) {
    if (profile[key] === true) {
      merged[key] = true;
    } else {
      delete merged[key];
    }
  }

  if (profile.receptor_node_count && profile.receptor_node_count > 0) {
    merged.receptor_node_count = profile.receptor_node_count;
  } else {
    delete merged.receptor_node_count;
  }

  return merged;
}

export function describeCapabilityProfile(profile: CapabilityProfile): Array<{ label: string; value: string }> {
  return [
    { label: "Management mode", value: profile.management_mode },
    { label: "Operator namespace", value: profile.operator_namespace || "Not declared" },
    { label: "Cluster namespace", value: profile.cluster_namespace || "Not declared" },
    { label: "Terraform workspace", value: profile.terraform_workspace || "Not declared" },
    { label: "Backstage entity", value: profile.backstage_entity_ref || "Not declared" },
    { label: "MCP endpoint", value: profile.mcp_endpoint || "Not declared" },
    { label: "Runner", value: profile.runner_enabled ? "Enabled" : "Disabled" },
    { label: "Execution builder", value: profile.builder_pipeline_enabled ? "Enabled" : "Disabled" },
    { label: "Receptor mesh", value: profile.receptor_mesh_enabled ? `Enabled${profile.receptor_node_count ? ` (${profile.receptor_node_count} nodes)` : ""}` : "Disabled" },
    { label: "Content signing", value: profile.content_signing_enabled ? "Enabled" : "Disabled" },
    { label: "Gateway-only access", value: profile.gateway_enforced ? "Expected" : "Optional" },
    { label: "Metrics and reports", value: profile.metrics_enabled || profile.automation_reports_enabled ? "Enabled" : "Disabled" },
    { label: "AI assist", value: profile.ai_assistant_enabled ? "Enabled" : "Disabled" },
  ];
}
