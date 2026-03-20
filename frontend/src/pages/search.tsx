import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { StatusPill } from "../components/status-pill";
import type { SearchResult } from "../types";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSearched(true);
    setSearching(true);
    try {
      const value = await api.search(query);
      setResults(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Search</p>
          <h2>Search the collected automation inventory</h2>
          <p className="page-header__description">Search templates, workflows, projects, credentials, activations, repositories, and collections across all synced AAP environments.</p>
        </div>
      </section>

      <section className="card">
        <form className="toolbar toolbar--form" onSubmit={onSubmit}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="text-input text-input--search" placeholder="Search resources by name, type, service, or environment" />
          <button type="submit" className="primary-button" disabled={query.trim().length < 2 || searching}>
            {searching ? "Searching..." : "Search inventory"}
          </button>
        </form>
        {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}
      </section>

      <section className="card">
        {!searched ? (
          <EmptyState title="Start with a resource query" description="Search becomes useful after environments are registered and synced, but you can query as soon as inventory is available." />
        ) : results.length === 0 ? (
          <EmptyState title="No matching resources found" description="Try a broader term or make sure the relevant environment has completed a successful sync." />
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Environment</th>
                  <th>Service</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.id}>
                    <td>
                      <div className="table-primary">
                        <span>{result.name}</span>
                        <span>{result.url ?? result.id}</span>
                      </div>
                    </td>
                    <td>
                      <Link to={`/environments/${result.environment_id}`}>{result.environment_name}</Link>
                    </td>
                    <td>{result.service}</td>
                    <td>{result.resource_type.replaceAll("_", " ")}</td>
                    <td>
                      <StatusPill status={result.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
