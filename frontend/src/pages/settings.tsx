import { useEffect, useState } from "react";

import { api } from "../api";
import { ActivityTable } from "../components/activity-table";
import { EmptyState } from "../components/empty-state";
import { StatCard } from "../components/stat-card";
import type { ActivityEvent, RuntimeSettings } from "../types";

export function SettingsPage() {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([api.runtimeSettings(controller.signal), api.activity(undefined, controller.signal)])
      .then(([settingsResult, activityResult]) => {
        if (controller.signal.aborted) return;
        if (settingsResult.status === "fulfilled") setSettings(settingsResult.value);
        else setError(settingsResult.reason?.message ?? "Failed to load settings");
        if (activityResult.status === "fulfilled") setActivity(activityResult.value);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  if (loading && !settings) {
    return <section className="card">Loading runtime settings...</section>;
  }

  if (error && !settings) {
    return <section className="card">Runtime settings unavailable: {error}</section>;
  }

  if (!settings) {
    return <section className="card">Loading runtime settings...</section>;
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Runtime settings</p>
          <h2>Runtime settings and sync activity</h2>
          <p className="page-header__description">Review the hub's current operating defaults, trusted headers, and the latest fleet synchronization jobs.</p>
        </div>
      </section>

      <section className="card-grid card-grid--four">
        <StatCard label="Mode" value={settings.environment} detail="Backend runtime environment" />
        <StatCard label="API prefix" value={settings.api_prefix} detail="Gateway path mounted by the API service" />
        <StatCard label="Default sync" value={`${settings.default_sync_interval_minutes}m`} detail="Scheduler fallback interval" />
        <StatCard label="Search limit" value={settings.search_result_limit} detail="Results returned per search request" />
      </section>

      <section className="page-columns">
        <article className="card">
          <div className="card__header">
            <div>
              <h3>Trusted headers</h3>
              <p>The gateway identity contract currently expected by the API.</p>
            </div>
          </div>
          {Object.keys(settings.trusted_headers).length === 0 ? (
            <EmptyState title="No trusted headers configured" description="The API is not configured with any trusted gateway headers." />
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Header</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(settings.trusted_headers).map(([field, header]) => (
                    <tr key={field}>
                      <td>{field}</td>
                      <td>{header}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="card">
          <div className="card__header">
            <div>
              <h3>Runtime defaults</h3>
              <p>These settings are loaded from the running backend configuration.</p>
            </div>
          </div>
          <dl className="details-list">
            <div>
              <dt>Request timeout</dt>
              <dd>{settings.request_timeout_seconds} seconds</dd>
            </div>
            <div>
              <dt>Gateway trusted proxy</dt>
              <dd>{settings.gateway_trusted_proxy ? "Enabled" : "Disabled"}</dd>
            </div>
            <div>
              <dt>CORS origins</dt>
              <dd>{settings.cors_origins.join(", ")}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <h3>Recent platform activity</h3>
            <p>Review sync jobs and operator actions recorded by the control hub.</p>
          </div>
        </div>
        {activity.length === 0 ? (
          <EmptyState title="No activity yet" description="Register an AAP environment and queue its first sync to populate the activity stream." />
        ) : (
          <ActivityTable items={activity.slice(0, 12)} />
        )}
      </section>
    </div>
  );
}
