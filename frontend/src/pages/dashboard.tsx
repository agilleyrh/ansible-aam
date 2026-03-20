import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { ActivityTable } from "../components/activity-table";
import { EmptyState } from "../components/empty-state";
import { StatCard } from "../components/stat-card";
import { StatusPill } from "../components/status-pill";
import type { ActivityEvent, DashboardResponse } from "../types";

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    Promise.allSettled([api.dashboard(controller.signal), api.activity(undefined, controller.signal)])
      .then(([dashboardResult, activityResult]) => {
        if (controller.signal.aborted) return;
        if (dashboardResult.status === "fulfilled") setData(dashboardResult.value);
        else setError(dashboardResult.reason?.message ?? "Failed to load dashboard");
        if (activityResult.status === "fulfilled") setActivity(activityResult.value);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, []);

  if (loading && !data) {
    return <section className="card">Loading dashboard...</section>;
  }

  if (error && !data) {
    return <section className="card">Dashboard unavailable: {error}</section>;
  }

  if (!data) {
    return <section className="card">Loading dashboard...</section>;
  }

  const hasEnvironments = data.environment_count > 0;
  const topResources = Object.entries(data.resource_breakdown)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);
  const topIntegrations = Object.entries(data.integration_breakdown)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);

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
            View runtime settings
          </Link>
          <Link className="primary-button" to="/environments">
            Open environment registry
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
              Register first environment
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

          <section className="page-columns">
            <article className="card">
              <div className="card__header">
                <div>
                  <h3>Automation estate coverage</h3>
                  <p>Resource types discovered from controller, EDA, and automation hub integrations.</p>
                </div>
                <Link className="secondary-button secondary-button--small" to="/search">
                  Search inventory
                </Link>
              </div>
              {topResources.length === 0 ? (
                <EmptyState title="No inventory collected" description="Queue a sync to populate templates, projects, activations, repositories, and other tracked resources." />
              ) : (
                <div className="meter-stack">
                  {topResources.map(([resourceType, count]) => (
                    <div key={resourceType} className="meter-row">
                      <span>{resourceType.replaceAll("_", " ")}</span>
                      <div className="meter">
                        <div className="meter__fill meter__fill--healthy" style={{ width: `${Math.min(count * 10, 100)}%` }} />
                      </div>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="card">
              <div className="card__header">
                <div>
                  <h3>Platform interface adoption</h3>
                  <p>Provisioning, runtime, portal, and trust patterns derived from the broader Ansible platform repositories.</p>
                </div>
                <Link className="secondary-button secondary-button--small" to="/environments">
                  Edit environment interfaces
                </Link>
              </div>
              {topIntegrations.length === 0 ? (
                <EmptyState title="No platform interfaces declared" description="Use the structured registration fields to declare operators, Terraform, runner, receptor, portal, and trust integrations." />
              ) : (
                <div className="meter-stack">
                  {topIntegrations.map(([integration, count]) => (
                    <div key={integration} className="meter-row">
                      <span>{integration.replace("management:", "").replaceAll("_", " ")}</span>
                      <div className="meter">
                        <div className="meter__fill meter__fill--healthy" style={{ width: `${Math.min(count * 20, 100)}%` }} />
                      </div>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>

          <section className="page-columns">
            <article className="card">
              <div className="card__header">
                <div>
                  <h3>Recent activity</h3>
                  <p>Syncs and remote actions aligned to an AAP-style activity stream.</p>
                </div>
                <Link className="secondary-button secondary-button--small" to="/activity">
                  View activity stream
                </Link>
              </div>
              {activity.length === 0 ? (
                <EmptyState title="No activity recorded" description="Register an environment, queue a sync, or launch a managed action to populate the feed." />
              ) : (
                <ActivityTable items={activity.slice(0, 6)} />
              )}
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
        </>
      )}
    </div>
  );
}
