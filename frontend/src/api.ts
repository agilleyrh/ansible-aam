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
  AuthProvider,
  AccessDirectory,
  IdentityProviderWrite,
} from "./types";

const API_PREFIX = import.meta.env.VITE_API_PREFIX ?? "/api/v1";

type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  allowUnauthorized?: boolean;
};

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && (err.name === "AbortError" || err.message.toLowerCase().includes("aborted")))
  );
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: HeadersInit = {
    Accept: "application/json",
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    if (isAbortError(err) || options.signal?.aborted) {
      throw err instanceof Error ? err : new Error("Request aborted");
    }
    throw new Error(
      "The browser could not reach the AAM API. If a content blocker is enabled, allow this site, then retry.",
    );
  }

  if (response.status === 401 && options.allowUnauthorized) {
    return null as T;
  }

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
  me: (signal?: AbortSignal) => request<CurrentUser | null>("/me", { signal, allowUnauthorized: true }),
  authProviders: (signal?: AbortSignal) =>
    request<{ local_login_enabled: boolean; providers: AuthProvider[] }>("/auth/providers", { signal }),
  login: (username: string, password: string) =>
    request<CurrentUser>("/auth/login", { method: "POST", body: { username, password } }),
  externalLogin: (providerId: string, username: string, password: string) =>
    request<CurrentUser>("/auth/external", {
      method: "POST",
      body: { provider_id: providerId, username, password },
    }),
  logout: () => request<{ status: string }>("/auth/logout", { method: "POST" }),
  accessDirectory: (signal?: AbortSignal) => request<AccessDirectory>("/access/directory", { signal }),
  createAccessUser: (payload: { username: string; email?: string; password: string; groups: string[] }) =>
    request<{ id: string; username: string }>("/access/users", { method: "POST", body: payload }),
  createAssignment: (payload: {
    role: string;
    scope: string;
    environment_id: string;
    principal_type: string;
    principal_id: string;
  }) => request<{ id: string }>("/access/assignments", { method: "POST", body: payload }),
  deleteAssignment: (id: string) => request<void>(`/access/assignments/${id}`, { method: "DELETE" }),
  createIdentityProvider: (payload: IdentityProviderWrite) =>
    request<{ id: string }>("/access/identity-providers", { method: "POST", body: payload }),
  updateIdentityProvider: (id: string, payload: IdentityProviderWrite) =>
    request<{ id: string }>(`/access/identity-providers/${id}`, { method: "PATCH", body: payload }),
  deleteIdentityProvider: (id: string) => request<void>(`/access/identity-providers/${id}`, { method: "DELETE" }),
  search: (q: string, signal?: AbortSignal) => request<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`, { signal }),
  syncExecutions: (signal?: AbortSignal) => request<SyncExecution[]>("/sync-executions", { signal }),
  activity: (environmentId?: string, signal?: AbortSignal) =>
    request<ActivityEvent[]>(`/events${environmentId ? `?environment_id=${encodeURIComponent(environmentId)}` : ""}`, {
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
