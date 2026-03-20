import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { StatusPill } from "../components/status-pill";
import type { EnvironmentSummary, TopologyResponse } from "../types";

export function TopologyPage() {
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [topology, setTopology] = useState<TopologyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .environments()
      .then((items) => {
        setEnvironments(items);
        if (items.length > 0) {
          setSelected(items[0].id);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selected) {
      return;
    }

    api.topology(selected).then(setTopology).catch((err: Error) => setError(err.message));
  }, [selected]);

  if (error) {
    return <section className="card">Topology unavailable: {error}</section>;
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Topology</p>
          <h2>Service and resource relationships</h2>
          <p className="page-header__description">Follow how each environment expands into services and then into collected resources after sync.</p>
        </div>
        {environments.length > 0 ? (
          <select value={selected} onChange={(event) => setSelected(event.target.value)} className="select-input select-input--compact">
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
        ) : null}
      </section>

      {environments.length === 0 ? (
        <EmptyState
          title="No topology available yet"
          description="Register and sync at least one AAP environment to populate service and resource relationships."
          action={
            <Link className="primary-button" to="/environments">
              Register environment
            </Link>
          }
        />
      ) : (
        <section className="card">
          <div className="topology-board">
            {topology?.nodes.map((node) => (
              <article key={node.id} className={`topology-node topology-node--${node.kind}`}>
                <div className="topology-node__header">
                  <strong>{node.label}</strong>
                  <StatusPill status={node.status} />
                </div>
                <p>{node.kind}</p>
              </article>
            ))}
          </div>
          {selected ? (
            <p className="footnote">
              Need the full configuration context? Open <Link to={`/environments/${selected}`}>the environment detail page</Link>.
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
