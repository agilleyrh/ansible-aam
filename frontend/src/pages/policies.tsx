import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { StatusPill } from "../components/status-pill";
import type { Policy, PolicyResult } from "../types";

export function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [results, setResults] = useState<PolicyResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([api.policies(controller.signal), api.policyResults(controller.signal)])
      .then(([policiesResult, resultsResult]) => {
        if (controller.signal.aborted) return;
        if (policiesResult.status === "fulfilled") setPolicies(policiesResult.value);
        else setError(policiesResult.reason?.message ?? "Failed to load policies");
        if (resultsResult.status === "fulfilled") setResults(resultsResult.value);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  if (error && policies.length === 0) {
    return <section className="card">Governance unavailable: {error}</section>;
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Governance</p>
          <h2>Fleet policies and compliance results</h2>
          <p className="page-header__description">Review policy definitions, severity, and the latest compliance outcomes reported by the scheduler and sync worker.</p>
        </div>
      </section>

      {loading ? (
        <section className="card"><p style={{ color: "var(--pf-text-muted)" }}>Loading policies...</p></section>
      ) : policies.length === 0 ? (
        <EmptyState title="No governance policies available" description="Once the backend seeds or creates policies, they will appear here with fleet evaluation results." />
      ) : (
        <section className="card-grid card-grid--three">
          {policies.map((policy) => (
            <article key={policy.id} className="card">
              <div className="card__header">
                <div>
                  <h3>{policy.name}</h3>
                  <p>{policy.description}</p>
                </div>
                <span className={`severity severity-${policy.severity}`}>{policy.severity}</span>
              </div>
              <pre className="rule-block">{JSON.stringify(policy.rule, null, 2)}</pre>
            </article>
          ))}
        </section>
      )}

      <section className="card">
        <div className="card__header">
          <div>
            <h3>Latest evaluations</h3>
            <p>Recent compliance outcomes across every managed environment.</p>
          </div>
          <Link className="secondary-button secondary-button--small" to="/environments">
            Open environment registry
          </Link>
        </div>
        {loading ? (
          <p style={{ color: "var(--pf-text-muted)" }}>Loading results...</p>
        ) : results.length === 0 ? (
          <EmptyState title="No policy results yet" description="Queue environment syncs to evaluate policies against collected service posture and inventory." />
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Policy</th>
                  <th>Status</th>
                  <th>Message</th>
                  <th>Evaluated</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const policy = policies.find((entry) => entry.id === result.policy_id);
                  return (
                    <tr key={result.id}>
                      <td>{policy?.name ?? result.policy_id}</td>
                      <td>
                        <StatusPill status={result.compliance} />
                      </td>
                      <td>{result.message}</td>
                      <td>{new Date(result.evaluated_at).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
