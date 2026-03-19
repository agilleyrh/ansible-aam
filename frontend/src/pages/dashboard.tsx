import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { StatCard } from "../components/stat-card";
import { StatusPill } from "../components/status-pill";
import type { DashboardResponse } from "../types";

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .dashboard()
      .then((value) => setData(value as DashboardResponse))
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return <section className="panel">Dashboard unavailable: {error}</section>;
  }

  if (!data) {
    return <section className="panel">Loading dashboard...</section>;
  }

  return (
    <div className="page-stack">
      <section className="hero">
        <div>
          <p className="eyebrow">Fleet overview</p>
          <h2>One hub for every controller, EDA node, and Private Automation Hub.</h2>
          <p className="hero__copy">
            ACM-style posture, but for automation: health rollups, compliance status, environment grouping, and direct
            actions into distributed AAP estates.
          </p>
        </div>
        <div className="hero__chips">
          <span>Controller</span>
          <span>EDA</span>
          <span>Private Automation Hub</span>
          <span>Gateway RBAC</span>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard label="Managed environments" value={data.environment_count} detail="All registered AAP estates" />
        <StatCard label="Healthy" value={data.healthy_count} detail="Meeting current fleet expectations" />
        <StatCard label="Warning" value={data.warning_count} detail="Requires review or policy remediation" />
        <StatCard label="Critical" value={data.critical_count} detail="Service failures or stale sync data" />
      </section>

      <section className="panel panel-grid">
        <div>
          <div className="section-header">
            <h3>Compliance</h3>
            <p>Mapped from policy evaluation results.</p>
          </div>
          <div className="meter-stack">
            {Object.entries(data.compliance).map(([key, value]) => (
              <div key={key} className="meter-row">
                <span>{key}</span>
                <div className="meter">
                  <div className="meter__fill" style={{ width: `${Math.min(value * 12, 100)}%` }} />
                </div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="section-header">
            <h3>Service rollup</h3>
            <p>Per-component health across the fleet.</p>
          </div>
          <div className="service-stack">
            {Object.entries(data.services).map(([service, counts]) => (
              <article key={service} className="service-card">
                <h4>{service.toUpperCase()}</h4>
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
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>Environment fleet</h3>
          <p>Central status for each AAP deployment.</p>
        </div>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Version</th>
                <th>Health score</th>
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
                  <td>{environment.groupings.join(", ") || "Unassigned"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

