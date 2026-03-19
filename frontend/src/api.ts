const API_PREFIX = import.meta.env.VITE_API_PREFIX ?? "/api/v1";

async function request<T>(path: string): Promise<T> {
  const headers: HeadersInit = {
    Accept: "application/json",
  };

  if (import.meta.env.DEV || import.meta.env.VITE_LOCAL_TRUSTED_HEADERS === "true") {
    headers["X-RH-User"] = "developer";
    headers["X-RH-Roles"] = "aam.admin";
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  dashboard: () => request("/dashboard"),
  environments: () => request("/environments"),
  environment: (id: string) => request(`/environments/${id}`),
  topology: (id: string) => request(`/environments/${id}/topology`),
  policies: () => request("/policies"),
  policyResults: () => request("/policy-results"),
  search: (q: string) => request(`/search?q=${encodeURIComponent(q)}`),
  syncExecutions: () => request("/sync-executions"),
};
