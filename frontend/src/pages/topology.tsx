import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { StatusPill } from "../components/status-pill";
import type { EnvironmentSummary, TopologyEdge, TopologyNode, TopologyResponse } from "../types";

type TreeNode = TopologyNode & { children: TreeNode[] };

function buildTree(nodes: TopologyNode[], edges: TopologyEdge[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, { ...node, children: [] });
  }

  const childIds = new Set<string>();
  for (const edge of edges) {
    const parent = nodeMap.get(edge.source);
    const child = nodeMap.get(edge.target);
    if (parent && child) {
      parent.children.push(child);
      childIds.add(edge.target);
    }
  }

  return nodes.filter((n) => !childIds.has(n.id)).map((n) => nodeMap.get(n.id)!);
}

function TopologyNodeCard({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <div className="topology-tree-item" style={{ marginLeft: `${depth * 1.5}rem` }}>
      <article className={`topology-node topology-node--${node.kind}`}>
        <div className="topology-node__header">
          <strong>{node.label}</strong>
          <StatusPill status={node.status} />
        </div>
        <p>{node.kind}</p>
        {Object.keys(node.metadata).length > 0 ? (
          <dl className="topology-node__meta">
            {Object.entries(node.metadata)
              .slice(0, 3)
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replaceAll("_", " ")}</dt>
                  <dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                </div>
              ))}
          </dl>
        ) : null}
      </article>
      {node.children.length > 0 ? (
        <div className="topology-tree-children">
          {node.children.map((child) => (
            <TopologyNodeCard key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TopologyEdgeList({ edges, nodes }: { edges: TopologyEdge[]; nodes: TopologyNode[] }) {
  const nodeLabels = new Map(nodes.map((n) => [n.id, n.label]));
  if (edges.length === 0) return null;
  return (
    <details className="topology-edges-details">
      <summary>{edges.length} relationship{edges.length !== 1 ? "s" : ""}</summary>
      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Relationship</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((edge, i) => (
              <tr key={i}>
                <td>{nodeLabels.get(edge.source) ?? edge.source}</td>
                <td><span className="topology-edge-label">{edge.relationship}</span></td>
                <td>{nodeLabels.get(edge.target) ?? edge.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function TopologyPage() {
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [topology, setTopology] = useState<TopologyResponse | null>(null);
  const [loading, setLoading] = useState(false);
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

    const controller = new AbortController();
    setLoading(true);
    setTopology(null);
    api
      .topology(selected, controller.signal)
      .then(setTopology)
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selected]);

  if (error && !topology) {
    return <section className="card">Topology unavailable: {error}</section>;
  }

  const tree = topology ? buildTree(topology.nodes, topology.edges) : [];

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Topology</p>
          <h2>Service and resource relationships</h2>
          <p className="page-header__description">Follow how each environment expands into services, collected resources, and declared platform integrations such as operators, Terraform, receptor, Backstage, and MCP.</p>
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
              Register first environment
            </Link>
          }
        />
      ) : loading ? (
        <section className="card"><p style={{ color: "var(--pf-text-muted)" }}>Loading topology...</p></section>
      ) : topology && topology.nodes.length === 0 ? (
        <section className="card">
          <EmptyState title="No topology data" description="Queue a sync for this environment to populate the topology graph." />
        </section>
      ) : (
        <section className="card">
          <div className="topology-tree">
            {tree.map((root) => (
              <TopologyNodeCard key={root.id} node={root} depth={0} />
            ))}
          </div>

          {topology ? (
            <TopologyEdgeList edges={topology.edges} nodes={topology.nodes} />
          ) : null}

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
