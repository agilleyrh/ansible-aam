import type {
  ActivityEvent,
  DashboardResponse,
  EnvironmentDetail,
  EnvironmentMutationPayload,
  EnvironmentSummary,
  Policy,
  PolicyResult,
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
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        detail = payload.detail;
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
  dashboard: () => request<DashboardResponse>("/dashboard"),
  environments: () => request<EnvironmentSummary[]>("/environments"),
  environment: (id: string) => request<EnvironmentDetail>(`/environments/${id}`),
  createEnvironment: (payload: EnvironmentMutationPayload) =>
    request<EnvironmentSummary>("/environments", { method: "POST", body: payload }),
  updateEnvironment: (id: string, payload: Partial<EnvironmentMutationPayload>) =>
    request<EnvironmentSummary>(`/environments/${id}`, { method: "PATCH", body: payload }),
  deleteEnvironment: (id: string) => request<void>(`/environments/${id}`, { method: "DELETE" }),
  syncEnvironment: (id: string) => request<SyncRequestResponse>(`/environments/${id}/sync`, { method: "POST" }),
  topology: (id: string) => request<TopologyResponse>(`/environments/${id}/topology`),
  policies: () => request<Policy[]>("/policies"),
  policyResults: () => request<PolicyResult[]>("/policy-results"),
  search: (q: string) => request<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`),
  syncExecutions: () => request<SyncExecution[]>("/sync-executions"),
  activity: (environmentId?: string) =>
    request<ActivityEvent[]>(`/activity${environmentId ? `?environment_id=${encodeURIComponent(environmentId)}` : ""}`),
  runtimeSettings: () => request<RuntimeSettings>("/settings/runtime"),
  executeAction: (payload: RemoteActionRequest) =>
    request<RemoteActionResponse>("/actions", { method: "POST", body: payload }),
};
