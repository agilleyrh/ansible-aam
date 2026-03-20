export type EnvironmentAuthMode = "oauth2" | "service_account" | "header_passthrough";

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
  labels: Record<string, unknown>;
  platform_url: string | null;
  gateway_url: string;
  controller_url: string | null;
  eda_url: string | null;
  hub_url: string | null;
  auth_mode: EnvironmentAuthMode;
  client_id: string | null;
  verify_ssl: boolean;
  sync_interval_minutes: number;
  capabilities: Record<string, unknown>;
  service_paths: Record<string, unknown>;
  snapshots: ServiceSnapshot[];
  resources: Resource[];
};

export type EnvironmentMutationPayload = {
  name: string;
  slug: string;
  description: string;
  owner: string;
  tags: string[];
  groupings: string[];
  labels: Record<string, unknown>;
  platform_url: string | null;
  gateway_url: string;
  controller_url: string | null;
  eda_url: string | null;
  hub_url: string | null;
  auth_mode: EnvironmentAuthMode;
  client_id: string | null;
  client_secret?: string | null;
  access_token?: string | null;
  verify_ssl: boolean;
  sync_interval_minutes: number;
  capabilities: Record<string, unknown>;
  service_paths: Record<string, unknown>;
};

export type DashboardResponse = {
  environment_count: number;
  healthy_count: number;
  warning_count: number;
  critical_count: number;
  compliance: Record<string, number>;
  services: Record<string, Record<string, number>>;
  resource_breakdown: Record<string, number>;
  integration_breakdown: Record<string, number>;
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

export type SyncExecution = {
  id: string;
  environment_id: string;
  status: string;
  requested_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_text: string | null;
  details: Record<string, unknown>;
};

export type SyncRequestResponse = {
  job_id: string;
  status: string;
};

export type RuntimeSettings = {
  environment: string;
  api_prefix: string;
  cors_origins: string[];
  gateway_trusted_proxy: boolean;
  default_sync_interval_minutes: number;
  search_result_limit: number;
  request_timeout_seconds: number;
  trusted_headers: Record<string, string>;
};

export type ActivityEvent = {
  id: string;
  kind: "sync" | "action";
  environment_id: string;
  environment_name: string;
  service: string;
  operation: string;
  target: string;
  status: string;
  requested_by: string;
  summary: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  details: Record<string, unknown>;
};

export type RemoteActionName =
  | "launch_job_template"
  | "launch_workflow_job_template"
  | "set_activation_state"
  | "sync_project"
  | "sync_repository";

export type RemoteActionRequest = {
  environment_id: string;
  action: RemoteActionName;
  target_id: string;
  target_name?: string | null;
  payload?: Record<string, unknown>;
  path_override?: string | null;
};

export type RemoteActionResponse = {
  action_id: string;
  status: string;
  service: string;
  target: string;
  response_body: Record<string, unknown>;
};
