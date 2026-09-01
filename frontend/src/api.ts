import type {
  ActivityEvent,
  CurrentUser,
  DashboardResponse,
  EnvironmentDetail,
  EnvironmentMutationPayload,
  EnvironmentSummary,
  FleetJobsResponse,
  FleetJobStats,
  MonitoringResponse,
  Policy,
  PolicyCreatePayload,
  PolicyPushResult,
  PolicyRemediateResult,
  ConfigBaseline,
  PolicyResult,
  EnvironmentGroup,
  RemoteActionRequest,
  RemoteActionResponse,
  RuntimeSettings,
  SearchResult,
  SyncExecution,
  SyncRequestResponse,
  TopologyResponse,
} from "./types";

const API_PREFIX = import.meta.env.VITE_API_PREFIX ?? "/api/v1";

type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: HeadersInit = {
    Accept: "application/json",
  };

  if (import.meta.env.DEV || import.meta.env.VITE_LOCAL_TRUSTED_HEADERS === "true") {
    headers["X-RH-User"] = "developer";
    headers["X-RH-Roles"] = "aam.admin";
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { detail?: string | unknown[] };
      if (typeof payload.detail === "string") {
        detail = payload.detail;
      } else if (Array.isArray(payload.detail)) {
        detail = payload.detail
          .map((item) =>
            typeof item === "object" && item !== null && "msg" in item ? (item as { msg: string }).msg : String(item),
          )
          .join("; ");
      }
    } catch {
      // Preserve the status text when the response body is empty or not JSON.
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  dashboard: (signal?: AbortSignal) => request<DashboardResponse>("/dashboard", { signal }),
  monitoring: (signal?: AbortSignal) => request<MonitoringResponse>("/monitoring", { signal }),
  environments: (signal?: AbortSignal) => request<EnvironmentSummary[]>("/environments", { signal }),
  environment: (id: string, signal?: AbortSignal) => request<EnvironmentDetail>(`/environments/${id}`, { signal }),
  createEnvironment: (payload: EnvironmentMutationPayload) =>
    request<EnvironmentSummary>("/environments", { method: "POST", body: payload }),
  updateEnvironment: (id: string, payload: Partial<EnvironmentMutationPayload>) =>
    request<EnvironmentSummary>(`/environments/${id}`, { method: "PATCH", body: payload }),
  deleteEnvironment: (id: string) => request<void>(`/environments/${id}`, { method: "DELETE" }),
  syncEnvironment: (id: string) => request<SyncRequestResponse>(`/environments/${id}/sync`, { method: "POST" }),
  topology: (id: string, signal?: AbortSignal) => request<TopologyResponse>(`/environments/${id}/topology`, { signal }),
  fleetTopology: (signal?: AbortSignal) => request<TopologyResponse>("/topology", { signal }),
  groups: (signal?: AbortSignal) => request<EnvironmentGroup[]>("/groups", { signal }),
  policies: (signal?: AbortSignal) => request<Policy[]>("/policies", { signal }),
  createPolicy: (payload: PolicyCreatePayload) => request<Policy>("/policies", { method: "POST", body: payload }),
  updatePolicy: (id: string, payload: Partial<Pick<Policy, "enabled" | "name" | "description" | "severity" | "scope" | "rule">>) =>
    request<Policy>(`/policies/${id}`, { method: "PATCH", body: payload }),
  pushPolicy: (id: string) => request<PolicyPushResult>(`/policies/${id}/push`, { method: "POST" }),
  remediatePolicy: (id: string) => request<PolicyRemediateResult>(`/policies/${id}/remediate`, { method: "POST" }),
  policyResults: (signal?: AbortSignal) => request<PolicyResult[]>("/policy-results", { signal }),
  configBaseline: (signal?: AbortSignal) => request<ConfigBaseline>("/config-baseline", { signal }),
  me: (signal?: AbortSignal) => request<CurrentUser>("/me", { signal }),
  search: (q: string, signal?: AbortSignal) => request<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`, { signal }),
  syncExecutions: (signal?: AbortSignal) => request<SyncExecution[]>("/sync-executions", { signal }),
  activity: (environmentId?: string, signal?: AbortSignal) =>
    request<ActivityEvent[]>(`/activity${environmentId ? `?environment_id=${encodeURIComponent(environmentId)}` : ""}`, {
      signal,
    }),
  runtimeSettings: (signal?: AbortSignal) => request<RuntimeSettings>("/settings/runtime", { signal }),
  executeAction: (payload: RemoteActionRequest) => request<RemoteActionResponse>("/actions", { method: "POST", body: payload }),
  jobs: (
    options: { status?: string; environmentId?: string; limitPerEnvironment?: number; signal?: AbortSignal } = {},
  ) => {
    const params = new URLSearchParams();
    if (options.status) {
      params.set("status", options.status);
    }
    if (options.environmentId) {
      params.set("environment_id", options.environmentId);
    }
    if (options.limitPerEnvironment) {
      params.set("limit_per_environment", String(options.limitPerEnvironment));
    }
    const query = params.toString();
    return request<FleetJobsResponse>(`/jobs${query ? `?${query}` : ""}`, { signal: options.signal });
  },
  jobStats: (signal?: AbortSignal) => request<FleetJobStats>("/jobs/stats", { signal }),
};
