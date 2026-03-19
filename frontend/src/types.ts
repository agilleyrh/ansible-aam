export type EnvironmentSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  owner: string;
  tags: string[];
  groupings: string[];
  status: string;
  platform_version: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  summary: Record<string, unknown>;
};

export type ServiceSnapshot = {
  service: string;
  health: string;
  summary: Record<string, unknown>;
  collected_at: string;
};

export type Resource = {
  id: string;
  service: string;
  resource_type: string;
  external_id: string;
  name: string;
  status: string;
  namespace: string | null;
  url: string | null;
  metadata_json: Record<string, unknown>;
  last_seen_at: string;
};

export type EnvironmentDetail = EnvironmentSummary & {
  snapshots: ServiceSnapshot[];
  resources: Resource[];
};

export type DashboardResponse = {
  environment_count: number;
  healthy_count: number;
  warning_count: number;
  critical_count: number;
  compliance: Record<string, number>;
  services: Record<string, Record<string, number>>;
  environment_summaries: EnvironmentSummary[];
};

export type Policy = {
  id: string;
  name: string;
  description: string;
  severity: string;
  enabled: boolean;
  scope: Record<string, unknown>;
  rule: Record<string, unknown>;
};

export type PolicyResult = {
  id: string;
  environment_id: string;
  policy_id: string;
  compliance: string;
  message: string;
  details: Record<string, unknown>;
  evaluated_at: string;
};

export type SearchResult = {
  id: string;
  environment_id: string;
  environment_name: string;
  service: string;
  resource_type: string;
  name: string;
  status: string;
  url: string | null;
  metadata: Record<string, unknown>;
};

export type TopologyNode = {
  id: string;
  label: string;
  kind: string;
  status: string;
  metadata: Record<string, unknown>;
};

export type TopologyEdge = {
  source: string;
  target: string;
  relationship: string;
};

export type TopologyResponse = {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
};

