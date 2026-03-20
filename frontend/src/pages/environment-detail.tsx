import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../api";
import { describeCapabilityProfile, parseCapabilityProfile } from "../capabilities";
import { ActivityTable } from "../components/activity-table";
import { EmptyState } from "../components/empty-state";
import { EnvironmentForm } from "../components/environment-form";
import { StatCard } from "../components/stat-card";
import { StatusPill } from "../components/status-pill";
import type { ActivityEvent, EnvironmentDetail, EnvironmentMutationPayload, RemoteActionName, Resource } from "../types";

type ResourceAction = {
  action: RemoteActionName;
  label: string;
  payload?: Record<string, unknown>;
};

function buildResourceAction(resource: Resource): ResourceAction | null {
  if (resource.service === "controller" && resource.resource_type === "job_template") {
    return { action: "launch_job_template", label: "Launch template" };
  }
  if (resource.service === "controller" && resource.resource_type === "workflow_job_template") {
    return { action: "launch_workflow_job_template", label: "Launch workflow" };
  }
  if (resource.service === "controller" && resource.resource_type === "project") {
    return { action: "sync_project", label: "Sync project" };
  }
  if (resource.service === "eda" && resource.resource_type === "activation") {
    const enabled = resource.status !== "disabled";
    return {
      action: "set_activation_state",
      label: enabled ? "Disable activation" : "Enable activation",
      payload: { enabled: !enabled },
    };
  }
  if (resource.service === "hub" && resource.resource_type === "repository") {
    return { action: "sync_repository", label: "Sync repository" };
  }
  return null;
}

function actionSuccessMessage(action: ResourceAction, resource: Resource) {
  if (action.action === "set_activation_state") {
    return `${action.payload?.enabled ? "Enabled" : "Disabled"} ${resource.name}.`;
  }
  return `${action.label} queued for ${resource.name}.`;
}

export function EnvironmentDetailPage() {
  const { environmentId } = useParams();
  const navigate = useNavigate();
  const [environment, setEnvironment] = useState<EnvironmentDetail | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadEnvironment(signal?: AbortSignal) {
    if (!environmentId) {
      return;
    }

    const [detailResult, activityResult] = await Promise.allSettled([
      api.environment(environmentId, signal),
      api.activity(environmentId, signal),
    ]);
    if (signal?.aborted) return;
    if (detailResult.status === "fulfilled") {
      setEnvironment(detailResult.value);
      setError(null);
    } else {
      setError(detailResult.reason?.message ?? "Failed to load environment");
    }
    if (activityResult.status === "fulfilled") setActivity(activityResult.value);
  }

  useEffect(() => {
    const controller = new AbortController();
    loadEnvironment(controller.signal).catch((err: Error) => {
      if (!controller.signal.aborted) setError(err.message);
    });
    return () => controller.abort();
  }, [environmentId]);

  async function handleSave(payload: EnvironmentMutationPayload, options: { syncAfterSave: boolean }) {
    if (!environmentId) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updatePayload: Partial<EnvironmentMutationPayload> = { ...payload };
      if (!payload.client_secret) {
        delete updatePayload.client_secret;
      }
      if (!payload.access_token) {
        delete updatePayload.access_token;
      }

      await api.updateEnvironment(environmentId, updatePayload);
      if (options.syncAfterSave) {
        await api.syncEnvironment(environmentId);
        setMessage("Environment updated and a sync was queued.");
      } else {
        setMessage("Environment settings saved.");
      }
      await loadEnvironment();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save environment settings.");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    if (!environmentId || !environment) {
      return;
    }

    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      await api.syncEnvironment(environmentId);
      setMessage(`Queued a sync for ${environment.name}.`);
      await loadEnvironment();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to queue a sync.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!environmentId || !environment) {
      return;
    }

    if (!window.confirm(`Delete ${environment.name}? This removes all collected resources, sync history, and policy results for this environment.`)) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.deleteEnvironment(environmentId);
      navigate("/environments");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete the environment.");
      setBusy(false);
    }
  }

  async function handleResourceAction(resource: Resource, action: ResourceAction) {
    if (!environmentId) {
      return;
    }

    setActioningId(`${resource.id}:${action.action}`);
    setError(null);
    setMessage(null);
    try {
      await api.executeAction({
        environment_id: environmentId,
        action: action.action,
        target_id: resource.external_id,
        target_name: resource.name,
        payload: action.payload,
      });
      setMessage(actionSuccessMessage(action, resource));
      await loadEnvironment();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to run ${action.label.toLowerCase()}.`);
    } finally {
      setActioningId(null);
    }
  }

  if (error && !environment) {
    return <section className="card">Environment unavailable: {error}</section>;
  }

  if (!environment) {
    return <section className="card">Loading environment...</section>;
  }

  const services = Array.from(new Set(environment.resources.map((resource) => resource.service))).sort();
  const resourceTypes = Array.from(new Set(environment.resources.map((resource) => resource.resource_type))).sort();
  const normalizedQuery = query.trim().toLowerCase();
  const filteredResources = environment.resources.filter((resource) => {
    if (serviceFilter !== "all" && resource.service !== serviceFilter) {
      return false;
    }
    if (typeFilter !== "all" && resource.resource_type !== typeFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }

    const haystack = [resource.name, resource.external_id, resource.resource_type, resource.service, resource.namespace]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const templateCount = environment.resources.filter((resource) =>
    resource.resource_type === "job_template" || resource.resource_type === "workflow_job_template",
  ).length;
  const projectCount = environment.resources.filter((resource) => resource.resource_type === "project").length;
  const activationCount = environment.resources.filter((resource) => resource.resource_type === "activation").length;
  const hubContentCount = environment.resources.filter((resource) => resource.service === "hub").length;
  const { profile: capabilityProfile, extraCapabilities } = parseCapabilityProfile(environment.capabilities);
  const capabilitySummary = describeCapabilityProfile(capabilityProfile);
  const endpointLinks = [
    { label: "Open platform URL", href: environment.platform_url },
    { label: "Open gateway URL", href: environment.gateway_url },
    { label: "Open controller URL", href: environment.controller_url },
    { label: "Open EDA URL", href: environment.eda_url },
    { label: "Open automation hub URL", href: environment.hub_url },
  ].filter((item): item is { label: string; href: string } => Boolean(item.href));

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Environment detail</p>
          <h2>{environment.name}</h2>
          <p className="page-header__description">{environment.description || "Managed AAP environment with registered endpoints, collection settings, and component posture."}</p>
        </div>
        <div className="page-header__actions">
          <StatusPill status={environment.status} />
          <button className="secondary-button" type="button" disabled={syncing} onClick={handleSync}>
            {syncing ? "Queueing..." : "Queue sync"}
          </button>
          <button className="danger-button" type="button" disabled={busy} onClick={handleDelete}>
            Delete environment
          </button>
        </div>
      </section>

      {message ? <div className="inline-alert inline-alert--success">{message}</div> : null}
      {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
      {environment.last_sync_error ? <div className="inline-alert inline-alert--danger">Last sync failed: {environment.last_sync_error}</div> : null}

      <section className="card-grid card-grid--four">
        <StatCard label="Version" value={environment.platform_version ?? "Unknown"} detail="Most recent platform version reported" />
        <StatCard label="Health score" value={String(environment.summary.health_score ?? "n/a")} detail="Calculated from collected service health" />
        <StatCard label="Tracked resources" value={String(environment.resources.length)} detail="Current inventory stored in the hub" />
        <StatCard label="Last sync" value={environment.last_synced_at ? new Date(environment.last_synced_at).toLocaleString() : "Never"} detail="Latest successful collection timestamp" />
      </section>

      <section className="card-grid card-grid--four">
        <StatCard label="Templates" value={templateCount} detail="Job templates and workflow templates" />
        <StatCard label="Projects" value={projectCount} detail="Controller and EDA project content" />
        <StatCard label="Activations" value={activationCount} detail="EDA rulebook activations currently tracked" />
        <StatCard label="Hub content" value={hubContentCount} detail="Repositories and collections available from automation hub" />
      </section>

      <section className="page-columns">
        <article className="card">
          <div className="card__header">
            <div>
              <h3>Registered endpoints</h3>
              <p>Remote services currently configured for collection and action relay.</p>
            </div>
          </div>
          <dl className="details-list">
            <div>
              <dt>Platform URL</dt>
              <dd>{environment.platform_url || "Not set"}</dd>
            </div>
            <div>
              <dt>Gateway URL</dt>
              <dd>{environment.gateway_url}</dd>
            </div>
            <div>
              <dt>Controller URL</dt>
              <dd>{environment.controller_url || "Not configured"}</dd>
            </div>
            <div>
              <dt>EDA URL</dt>
              <dd>{environment.eda_url || "Not configured"}</dd>
            </div>
            <div>
              <dt>Automation Hub URL</dt>
              <dd>{environment.hub_url || "Not configured"}</dd>
            </div>
            <div>
              <dt>Authentication</dt>
              <dd>{environment.auth_mode}</dd>
            </div>
            <div>
              <dt>Verify TLS</dt>
              <dd>{environment.verify_ssl ? "Enabled" : "Disabled"}</dd>
            </div>
            <div>
              <dt>Tags / groups</dt>
              <dd>{[...environment.tags, ...environment.groupings].join(", ") || "None set"}</dd>
            </div>
          </dl>
          <div className="link-cluster">
            {endpointLinks.map((item) => (
              <a key={item.label} className="secondary-button secondary-button--small" href={item.href} target="_blank" rel="noreferrer">
                {item.label}
              </a>
            ))}
          </div>
        </article>

        <article className="card">
          <div className="card__header">
            <div>
              <h3>Recent activity stream</h3>
              <p>Sync runs and remote actions scoped to this environment.</p>
            </div>
            <Link className="secondary-button secondary-button--small" to="/activity">
              View fleet activity
            </Link>
          </div>
          {activity.length === 0 ? (
            <EmptyState title="No activity yet" description="Queue a sync or run an action against a collected resource to populate the stream." action={<button className="primary-button" type="button" onClick={handleSync}>Queue sync</button>} />
          ) : (
            <ActivityTable items={activity.slice(0, 8)} showEnvironment={false} />
          )}
        </article>
      </section>

      <EnvironmentForm
        mode="edit"
        initialValue={environment}
        title="Connection and registration settings"
        description="Update endpoint locations, authentication, labels, and service behavior for this managed environment."
        submitLabel="Save changes"
        busy={busy}
        errorMessage={error}
        onSubmit={handleSave}
      />

      <section className="page-columns">
        <article className="card">
          <div className="card__header">
            <div>
              <h3>Platform integration profile</h3>
              <p>Lifecycle, runtime, portal, and trust capabilities mapped from the broader Ansible platform ecosystem.</p>
            </div>
          </div>
          <dl className="details-list">
            {capabilitySummary.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="card">
          <div className="card__header">
            <div>
              <h3>Additional capability flags</h3>
              <p>Any extra capability settings that do not yet map to the structured profile.</p>
            </div>
          </div>
          {Object.keys(extraCapabilities).length === 0 ? (
            <EmptyState title="No additional capability flags" description="All current capability settings are represented by the structured integration profile." />
          ) : (
            <pre className="rule-block">{JSON.stringify(extraCapabilities, null, 2)}</pre>
          )}
        </article>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <h3>Service posture</h3>
            <p>Collected health summaries for each registered AAP component.</p>
          </div>
          <Link className="secondary-button secondary-button--small" to="/topology">
            View topology
          </Link>
        </div>

        {environment.snapshots.length === 0 ? (
          <EmptyState title="No service data collected yet" description="After the first sync, health, counts, and component-specific posture details will appear here." />
        ) : (
          <div className="service-stack">
            {environment.snapshots.map((snapshot) => (
              <article key={snapshot.service} className="service-card">
                <div className="service-card__title">
                  <h4>{snapshot.service.toUpperCase()}</h4>
                  <StatusPill status={snapshot.health} />
                </div>
                <dl className="summary-grid">
                  {Object.entries(snapshot.summary).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key.replaceAll("_", " ")}</dt>
                      <dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <h3>Tracked inventory</h3>
            <p>Controller, EDA, and automation hub resources with the direct actions that map to upstream AAP workflows.</p>
          </div>
        </div>

        {environment.resources.length === 0 ? (
          <EmptyState title="No inventory collected yet" description="Queue a sync after the endpoints and credentials are valid to populate managed resources." />
        ) : (
          <>
            <div className="toolbar toolbar--form toolbar--filters">
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="text-input text-input--search" placeholder="Filter resources by name, ID, type, service, or namespace" />
              <select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)} className="select-input select-input--compact">
                <option value="all">All services</option>
                {services.map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="select-input select-input--compact">
                <option value="all">All resource types</option>
                {resourceTypes.map((resourceType) => (
                  <option key={resourceType} value={resourceType}>
                    {resourceType.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>

            {filteredResources.length === 0 ? (
              <EmptyState title="No resources match the current filters" description="Broaden the search, choose a different service, or queue a fresh sync." />
            ) : (
              <div className="table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Service</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Last seen</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResources.map((resource) => {
                      const action = buildResourceAction(resource);
                      const busyAction = action ? `${resource.id}:${action.action}` === actioningId : false;
                      return (
                        <tr key={resource.id}>
                          <td>
                            <div className="table-primary">
                              <span>{resource.name}</span>
                              <span>{[resource.namespace, resource.external_id].filter(Boolean).join(" · ")}</span>
                            </div>
                          </td>
                          <td>{resource.service}</td>
                          <td>{resource.resource_type.replaceAll("_", " ")}</td>
                          <td>
                            <StatusPill status={resource.status} />
                          </td>
                          <td>{new Date(resource.last_seen_at).toLocaleString()}</td>
                          <td>
                            {action ? (
                              <button className="secondary-button secondary-button--small" type="button" disabled={busyAction} onClick={() => handleResourceAction(resource, action)}>
                                {busyAction ? "Working..." : action.label}
                              </button>
                            ) : (
                              <span className="table-muted">No direct action</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
