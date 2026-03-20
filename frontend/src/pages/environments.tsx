import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { EnvironmentForm } from "../components/environment-form";
import { StatusPill } from "../components/status-pill";
import type { EnvironmentMutationPayload, EnvironmentSummary } from "../types";

export function EnvironmentsPage() {
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  async function loadEnvironments() {
    const items = await api.environments();
    setEnvironments(items);
  }

  useEffect(() => {
    loadEnvironments().catch((err: Error) => setError(err.message));
  }, []);

  async function handleCreate(payload: EnvironmentMutationPayload, options: { syncAfterSave: boolean }) {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const environment = await api.createEnvironment(payload);
      if (options.syncAfterSave) {
        await api.syncEnvironment(environment.id);
        setMessage(`Registered ${environment.name} and queued an initial sync.`);
      } else {
        setMessage(`Registered ${environment.name}.`);
      }
      await loadEnvironments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to register the environment.");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function queueSync(environment: EnvironmentSummary) {
    setSyncingId(environment.id);
    setError(null);
    setMessage(null);
    try {
      await api.syncEnvironment(environment.id);
      setMessage(`Queued a sync for ${environment.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to queue a sync.");
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Environments</p>
          <h2>Register and manage AAP environments</h2>
          <p className="page-header__description">Add platform gateway endpoints, controller APIs, EDA services, and automation hubs that should be collected and governed.</p>
        </div>
      </section>

      {message ? <div className="inline-alert inline-alert--success">{message}</div> : null}
      {error ? <div className="inline-alert inline-alert--danger">{error}</div> : null}

      <section className="page-columns page-columns--wide-right">
        <article className="card">
          <div className="card__header">
            <div>
              <h3>Registered environments</h3>
              <p>{environments.length === 0 ? "No AAP environments are registered yet." : "Use the detail view to edit credentials, service endpoints, and sync settings."}</p>
            </div>
          </div>

          {environments.length === 0 ? (
            <EmptyState title="No environments registered" description="Use the registration form to add your first Ansible Automation Platform deployment." />
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Owner</th>
                    <th>Last sync</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {environments.map((environment) => (
                    <tr key={environment.id}>
                      <td>
                        <div className="table-primary">
                          <Link to={`/environments/${environment.id}`}>{environment.name}</Link>
                          <span>{environment.groupings.join(", ") || environment.slug}</span>
                        </div>
                      </td>
                      <td>
                        <StatusPill status={environment.status} />
                      </td>
                      <td>{environment.owner || "Unassigned"}</td>
                      <td>{environment.last_synced_at ? new Date(environment.last_synced_at).toLocaleString() : "Never"}</td>
                      <td>
                        <div className="row-actions">
                          <Link className="secondary-button secondary-button--small" to={`/environments/${environment.id}`}>
                            View details
                          </Link>
                          <button className="secondary-button secondary-button--small" type="button" disabled={syncingId === environment.id} onClick={() => queueSync(environment)}>
                            {syncingId === environment.id ? "Queueing..." : "Queue sync"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <EnvironmentForm
          mode="create"
          title="Register environment"
          description="Create a managed environment record with its gateway, services, and collection credentials."
          submitLabel="Register environment"
          busy={busy}
          errorMessage={error}
          onSubmit={handleCreate}
        />
      </section>
    </div>
  );
}
