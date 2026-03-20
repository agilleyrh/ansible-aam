import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { StatCard } from "../components/stat-card";
import { StatusPill } from "../components/status-pill";
import type { DashboardResponse, SyncExecution } from "../types";

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [executions, setExecutions] = useState<SyncExecution[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.dashboard(), api.syncExecutions()])
      .then(([dashboard, history]) => {
        setData(dashboard);
        setExecutions(history);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return <section className="card">Dashboard unavailable: {error}</section>;
  }

  if (!data) {
    return <section className="card">Loading dashboard...</section>;
  }

  const hasEnvironments = data.environment_count > 0;

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>Multi-environment automation operations</h2>
          <p className="page-header__description">Track health, compliance, and component posture across every registered AAP environment from one console.</p>
        </div>
        <div className="page-header__actions">
          <Link className="secondary-button" to="/settings">
            Administration
          </Link>
          <Link className="primary-button" to="/environments">
            Register environment
          </Link>
        </div>
      </section>

      <section className="card-grid card-grid--four">
        <StatCard label="Managed environments" value={data.environment_count} detail="Registered AAP estates" />
        <StatCard label="Healthy" value={data.healthy_count} detail="No current collection or policy issues" />
        <StatCard label="Warning" value={data.warning_count} detail="Needs review or follow-up" />
        <StatCard label="Critical" value={data.critical_count} detail="Sync or service failures detected" />
      </section>

      {!hasEnvironments ? (
        <EmptyState
          title="No AAP environments registered"
          description="Register your first controller, gateway, EDA, or automation hub endpoint to populate dashboard health, topology, and governance data."
          action={
            <Link className="primary-button" to="/environments">
              Open registration
            </Link>
          }
        />
      ) : (
        <>
          <section className="page-columns">
            <article className="card">
              <div className="card__header">
                <div>
                  <h3>Compliance rollup</h3>
                  <p>Most recent policy outcomes across the fleet.</p>
                </div>
              </div>
              <div className="meter-stack">
                {Object.entries(data.compliance).map(([key, value]) => (
                  <div key={key} className="meter-row">
                    <span>{key}</span>
                    <div className="meter">
                      <div className={`meter__fill meter__fill--${key.toLowerCase()}`} style={{ width: `${Math.min(value * 18, 100)}%` }} />
                    </div>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="card">
              <div className="card__header">
                <div>
                  <h3>Service health</h3>
                  <p>Component readiness by service type.</p>
                </div>
              </div>
              <div className="service-stack">
                {Object.entries(data.services).map(([service, counts]) => (
                  <article key={service} className="service-card">
                    <div className="service-card__title">
                      <h4>{service.toUpperCase()}</h4>
                    </div>
                    <div className="service-card__metrics">
                      {Object.entries(counts).map(([status, value]) => (
                        <div key={status}>
                          <StatusPill status={status} />
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </section>

          <section className="card">
            <div className="card__header">
              <div>
                <h3>Environment registry</h3>
                <p>Operational view of every registered automation footprint.</p>
              </div>
            </div>
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>Health score</th>
                    <th>Last sync</th>
                    <th>Groups</th>
                  </tr>
                </thead>
                <tbody>
                  {data.environment_summaries.map((environment) => (
                    <tr key={environment.id}>
                      <td>
                        <Link to={`/environments/${environment.id}`}>{environment.name}</Link>
                      </td>
                      <td>
                        <StatusPill status={environment.status} />
                      </td>
                      <td>{environment.platform_version ?? "Unknown"}</td>
                      <td>{String(environment.summary.health_score ?? "n/a")}</td>
                      <td>{environment.last_synced_at ? new Date(environment.last_synced_at).toLocaleString() : "Never"}</td>
                      <td>{environment.groupings.join(", ") || "Unassigned"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div>
                <h3>Recent sync jobs</h3>
                <p>Latest collection activity across the fleet.</p>
              </div>
            </div>
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Environment</th>
                    <th>Status</th>
                    <th>Requested by</th>
                    <th>Started</th>
                    <th>Finished</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.slice(0, 6).map((execution) => {
                    const environment = data.environment_summaries.find((item) => item.id === execution.environment_id);
                    return (
                      <tr key={execution.id}>
                        <td>{environment?.name ?? execution.environment_id}</td>
                        <td>
                          <StatusPill status={execution.status} />
                        </td>
                        <td>{execution.requested_by}</td>
                        <td>{execution.started_at ? new Date(execution.started_at).toLocaleString() : "Queued"}</td>
                        <td>{execution.finished_at ? new Date(execution.finished_at).toLocaleString() : "Running"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
