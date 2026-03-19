import { FormEvent, useState } from "react";

import { api } from "../api";
import { StatusPill } from "../components/status-pill";
import type { SearchResult } from "../types";

export function SearchPage() {
  const [query, setQuery] = useState("template");
  const [results, setResults] = useState<SearchResult[]>([]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = (await api.search(query)) as SearchResult[];
    setResults(value);
  }

  return (
    <div className="page-stack">
      <section className="section-header">
        <div>
          <p className="eyebrow">Global search</p>
          <h2>Find job templates, rulebook activations, inventories, and collections across all AAP estates.</h2>
        </div>
      </section>

      <section className="panel">
        <form className="search-form" onSubmit={onSubmit}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="search-input" placeholder="Search resources" />
          <button type="submit" className="primary-button">
            Search fleet
          </button>
        </form>
      </section>

      <section className="panel">
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
                  <td>{result.name}</td>
                  <td>{result.environment_name}</td>
                  <td>{result.service}</td>
                  <td>{result.resource_type}</td>
                  <td>
                    <StatusPill status={result.status} />
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

