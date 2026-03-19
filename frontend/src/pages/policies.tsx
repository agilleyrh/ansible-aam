import { useEffect, useState } from "react";

import { api } from "../api";
import { StatusPill } from "../components/status-pill";
import type { Policy, PolicyResult } from "../types";

export function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [results, setResults] = useState<PolicyResult[]>([]);

  useEffect(() => {
    api.policies().then((value) => setPolicies(value as Policy[]));
    api.policyResults().then((value) => setResults(value as PolicyResult[]));
  }, []);

  return (
    <div className="page-stack">
      <section className="section-header">
        <div>
          <p className="eyebrow">Governance</p>
          <h2>Automation guardrails modeled after ACM policies.</h2>
        </div>
        <p className="section-header__aside">
          Evaluate version drift, sync freshness, service enablement, and controller reliability from one place.
        </p>
      </section>

      <section className="policy-grid">
        {policies.map((policy) => (
          <article key={policy.id} className="panel policy-card">
            <div className="policy-card__header">
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

      <section className="panel">
        <div className="section-header">
          <h3>Latest evaluations</h3>
          <p>Most recent fleet compliance outcomes.</p>
        </div>
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
      </section>
    </div>
  );
}

