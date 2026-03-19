import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { StatusPill } from "../components/status-pill";
import type { EnvironmentSummary, TopologyResponse } from "../types";

export function TopologyPage() {
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [topology, setTopology] = useState<TopologyResponse | null>(null);

  useEffect(() => {
    api.environments().then((value) => {
      const items = value as EnvironmentSummary[];
      setEnvironments(items);
      if (items.length > 0) {
        setSelected(items[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!selected) {
      return;
    }
    api.topology(selected).then((value) => setTopology(value as TopologyResponse));
  }, [selected]);

  return (
    <div className="page-stack">
      <section className="section-header">
        <div>
          <p className="eyebrow">Topology</p>
          <h2>Relationship view for service and resource ownership.</h2>
        </div>
        <select value={selected} onChange={(event) => setSelected(event.target.value)} className="select-input">
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {environment.name}
            </option>
          ))}
        </select>
      </section>

      <section className="panel">
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
            Open the detailed relationship set in <Link to={`/environments/${selected}`}>environment details</Link>.
          </p>
        ) : null}
      </section>
    </div>
  );
}

