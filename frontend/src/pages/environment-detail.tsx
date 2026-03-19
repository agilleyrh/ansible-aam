import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../api";
import { StatCard } from "../components/stat-card";
import { StatusPill } from "../components/status-pill";
import type { EnvironmentDetail } from "../types";

export function EnvironmentDetailPage() {
  const { environmentId } = useParams();
  const [environment, setEnvironment] = useState<EnvironmentDetail | null>(null);

  useEffect(() => {
    if (!environmentId) {
      return;
    }
    api.environment(environmentId).then((value) => setEnvironment(value as EnvironmentDetail));
  }, [environmentId]);

  if (!environment) {
    return <section className="panel">Loading environment...</section>;
  }

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">{environment.slug}</p>
          <h2>{environment.name}</h2>
          <p className="hero__copy">{environment.description || "Centralized view of component posture, tracked resources, and policy status."}</p>
        </div>
        <StatusPill status={environment.status} />
      </section>

      <section className="stat-grid">
        <StatCard label="Version" value={environment.platform_version ?? "Unknown"} />
        <StatCard label="Health score" value={String(environment.summary.health_score ?? "n/a")} />
        <StatCard label="Tracked resources" value={String(environment.resources.length)} />
        <StatCard label="Last sync" value={environment.last_synced_at ? new Date(environment.last_synced_at).toLocaleString() : "Never"} />
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>Component posture</h3>
          <p>Service-level summaries imported from each AAP environment.</p>
        </div>
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
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>Tracked resources</h3>
          <p>Cross-service inventory to drive search and topology.</p>
        </div>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Service</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {environment.resources.map((resource) => (
                <tr key={resource.id}>
                  <td>{resource.name}</td>
                  <td>{resource.service}</td>
                  <td>{resource.resource_type}</td>
                  <td>
                    <StatusPill status={resource.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

