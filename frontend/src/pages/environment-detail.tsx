import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { EnvironmentForm } from "../components/environment-form";
import { StatCard } from "../components/stat-card";
import { StatusPill } from "../components/status-pill";
import type { EnvironmentDetail, EnvironmentMutationPayload, SyncExecution } from "../types";

export function EnvironmentDetailPage() {
  const { environmentId } = useParams();
  const navigate = useNavigate();
  const [environment, setEnvironment] = useState<EnvironmentDetail | null>(null);
  const [executions, setExecutions] = useState<SyncExecution[]>([]);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadEnvironment() {
    if (!environmentId) {
      return;
    }

    const [detail, history] = await Promise.all([api.environment(environmentId), api.syncExecutions()]);
    setEnvironment(detail);
    setExecutions(history.filter((entry) => entry.environment_id === environmentId));
  }

  useEffect(() => {
    loadEnvironment().catch((err: Error) => setError(err.message));
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

  if (error && !environment) {
    return <section className="card">Environment unavailable: {error}</section>;
  }

  if (!environment) {
    return <section className="card">Loading environment...</section>;
  }

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
            {syncing ? "Queueing..." : "Sync now"}
          </button>
          <button className="danger-button" type="button" disabled={busy} onClick={handleDelete}>
            Delete
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
            {[environment.platform_url, environment.gateway_url, environment.controller_url, environment.eda_url, environment.hub_url]
              .filter((value): value is string => Boolean(value))
              .map((value) => (
                <a key={value} className="secondary-button secondary-button--small" href={value} target="_blank" rel="noreferrer">
                  Open endpoint
                </a>
              ))}
          </div>
        </article>

        <article className="card">
          <div className="card__header">
            <div>
              <h3>Recent sync activity</h3>
              <p>Latest collection jobs for this environment.</p>
            </div>
          </div>
          {executions.length === 0 ? (
            <EmptyState title="No sync jobs yet" description="Queue the first sync to collect platform health, resources, and policy state." action={<button className="primary-button" type="button" onClick={handleSync}>Sync now</button>} />
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Requested by</th>
                    <th>Started</th>
                    <th>Finished</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.slice(0, 5).map((execution) => (
                    <tr key={execution.id}>
                      <td>
                        <StatusPill status={execution.status} />
                      </td>
                      <td>{execution.requested_by}</td>
                      <td>{execution.started_at ? new Date(execution.started_at).toLocaleString() : "Queued"}</td>
                      <td>{execution.finished_at ? new Date(execution.finished_at).toLocaleString() : execution.error_text ?? "Running"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      <section className="card">
        <div className="card__header">
          <div>
            <h3>Service posture</h3>
            <p>Collected health summaries for each registered AAP component.</p>
          </div>
          <Link className="secondary-button secondary-button--small" to="/topology">
            Open topology
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
            <p>Resources collected from controller, EDA, and automation hub services.</p>
          </div>
        </div>

        {environment.resources.length === 0 ? (
          <EmptyState title="No inventory collected yet" description="Queue a sync after the endpoints and credentials are valid to populate managed resources." />
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
                </tr>
              </thead>
              <tbody>
                {environment.resources.map((resource) => (
                  <tr key={resource.id}>
                    <td>
                      <div className="table-primary">
                        <span>{resource.name}</span>
                        <span>{resource.external_id}</span>
                      </div>
                    </td>
                    <td>{resource.service}</td>
                    <td>{resource.resource_type}</td>
                    <td>
                      <StatusPill status={resource.status} />
                    </td>
                    <td>{new Date(resource.last_seen_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
