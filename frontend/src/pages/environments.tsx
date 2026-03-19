import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { StatusPill } from "../components/status-pill";
import type { EnvironmentSummary } from "../types";

export function EnvironmentsPage() {
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);

  useEffect(() => {
    api.environments().then((value) => setEnvironments(value as EnvironmentSummary[]));
  }, []);

  return (
    <section className="page-stack">
      <div className="section-header">
        <div>
          <p className="eyebrow">Managed environments</p>
          <h2>Every AAP instance, grouped and searchable.</h2>
        </div>
        <p className="section-header__aside">Use owner, tags, and environment groups to mirror business-unit or tenancy boundaries.</p>
      </div>

      <div className="environment-grid">
        {environments.map((environment) => (
          <article key={environment.id} className="environment-card">
            <div className="environment-card__header">
              <div>
                <h3>{environment.name}</h3>
                <p>{environment.description || "No description configured."}</p>
              </div>
              <StatusPill status={environment.status} />
            </div>
            <dl className="kv-grid">
              <div>
                <dt>Version</dt>
                <dd>{environment.platform_version ?? "Unknown"}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{environment.owner || "Platform team"}</dd>
              </div>
              <div>
                <dt>Groups</dt>
                <dd>{environment.groupings.join(", ") || "Unassigned"}</dd>
              </div>
              <div>
                <dt>Health score</dt>
                <dd>{String(environment.summary.health_score ?? "n/a")}</dd>
              </div>
            </dl>
            <div className="chip-row">
              {environment.tags.map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </div>
            <Link className="action-link" to={`/environments/${environment.id}`}>
              Open environment
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

