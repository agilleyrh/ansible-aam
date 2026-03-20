import { useEffect, useState } from "react";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { StatusPill } from "../components/status-pill";
import type { RuntimeSettings, SyncExecution } from "../types";

export function SettingsPage() {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [executions, setExecutions] = useState<SyncExecution[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.runtimeSettings(), api.syncExecutions()])
      .then(([runtime, history]) => {
        setSettings(runtime);
        setExecutions(history);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return <section className="card">Administration unavailable: {error}</section>;
  }

  if (!settings) {
    return <section className="card">Loading administration settings...</section>;
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Runtime settings and sync activity</h2>
          <p className="page-header__description">Review the hub’s current operating defaults, trusted headers, and the latest fleet synchronization jobs.</p>
        </div>
      </section>

      <section className="card-grid card-grid--four">
        <article className="stat-card">
          <p className="stat-card__label">Mode</p>
          <p className="stat-card__value">{settings.environment}</p>
          <p className="stat-card__detail">Backend runtime environment</p>
        </article>
        <article className="stat-card">
          <p className="stat-card__label">API prefix</p>
          <p className="stat-card__value">{settings.api_prefix}</p>
          <p className="stat-card__detail">Gateway path mounted by the API service</p>
        </article>
        <article className="stat-card">
          <p className="stat-card__label">Default sync</p>
          <p className="stat-card__value">{settings.default_sync_interval_minutes}m</p>
          <p className="stat-card__detail">Scheduler fallback interval</p>
        </article>
        <article className="stat-card">
          <p className="stat-card__label">Search limit</p>
          <p className="stat-card__value">{settings.search_result_limit}</p>
          <p className="stat-card__detail">Results returned per search request</p>
        </article>
      </section>

      <section className="page-columns">
        <article className="card">
          <div className="card__header">
            <div>
              <h3>Trusted headers</h3>
              <p>The gateway identity contract currently expected by the API.</p>
            </div>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Header</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(settings.trusted_headers).map(([field, header]) => (
                  <tr key={field}>
                    <td>{field}</td>
                    <td>{header}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <div className="card__header">
            <div>
              <h3>Runtime defaults</h3>
              <p>These settings are loaded from the running backend configuration.</p>
            </div>
          </div>
          <dl className="details-list">
            <div>
              <dt>Request timeout</dt>
              <dd>{settings.request_timeout_seconds} seconds</dd>
            </div>
            <div>
              <dt>Gateway trusted proxy</dt>
              <dd>{settings.gateway_trusted_proxy ? "Enabled" : "Disabled"}</dd>
            </div>
            <div>
              <dt>CORS origins</dt>
              <dd>{settings.cors_origins.join(", ")}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <h3>Recent sync activity</h3>
            <p>Track queued, completed, and failed collection jobs across all registered environments.</p>
          </div>
        </div>
        {executions.length === 0 ? (
          <EmptyState title="No sync activity yet" description="Register an AAP environment and queue its first sync to populate the activity stream." />
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Environment</th>
                  <th>Status</th>
                  <th>Requested by</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((execution) => (
                  <tr key={execution.id}>
                    <td>{execution.environment_id}</td>
                    <td>
                      <StatusPill status={execution.status} />
                    </td>
                    <td>{execution.requested_by}</td>
                    <td>{execution.started_at ? new Date(execution.started_at).toLocaleString() : "Not started"}</td>
                    <td>{execution.finished_at ? new Date(execution.finished_at).toLocaleString() : "In progress"}</td>
                    <td>{execution.error_text ?? JSON.stringify(execution.details)}</td>
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
