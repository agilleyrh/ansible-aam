import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { ActivityTable } from "../components/activity-table";
import { EmptyState } from "../components/empty-state";
import { StatCard } from "../components/stat-card";
import type { ActivityEvent, EnvironmentSummary } from "../types";

export function ActivityPage() {
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState("all");
  const [items, setItems] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.environments().then(setEnvironments).catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api
      .activity(selectedEnvironmentId === "all" ? undefined : selectedEnvironmentId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setItems(value);
          setError(null);
        }
      })
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedEnvironmentId]);

  if (loading && items.length === 0) {
    return <section className="card">Loading activity stream...</section>;
  }

  if (error && items.length === 0) {
    return <section className="card">Activity stream unavailable: {error}</section>;
  }

  const syncCount = items.filter((item) => item.kind === "sync").length;
  const actionCount = items.filter((item) => item.kind === "action").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const activeCount = items.filter((item) => item.status === "queued" || item.status === "running").length;

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Activity</p>
          <h2>Fleet activity stream</h2>
          <p className="page-header__description">Review syncs, remote launches, repository syncs, and activation changes across the managed automation estate.</p>
        </div>
        <div className="page-header__actions">
          <Link className="secondary-button" to="/environments">
            Open environment registry
          </Link>
          <select value={selectedEnvironmentId} onChange={(event) => setSelectedEnvironmentId(event.target.value)} className="select-input select-input--compact">
            <option value="all">All environments</option>
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="card-grid card-grid--four">
        <StatCard label="Events" value={items.length} detail="Latest stream entries loaded" />
        <StatCard label="Sync jobs" value={syncCount} detail="Collection and policy evaluation runs" />
        <StatCard label="Remote actions" value={actionCount} detail="Operator-initiated actions on managed services" />
        <StatCard label="Needs attention" value={failedCount + activeCount} detail="Failed, queued, or running events" />
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <h3>Recent activity</h3>
            <p>Ordered newest first and aligned to the activity-stream pattern used across controller and AAP.</p>
          </div>
        </div>
        {loading && items.length > 0 ? (
          <div className="inline-alert">Refreshing activity stream...</div>
        ) : items.length === 0 ? (
          <EmptyState title="No activity yet" description="Register an environment, queue a sync, or run a remote action to start populating the stream." />
        ) : (
          <ActivityTable items={items} showEnvironment={selectedEnvironmentId === "all"} />
        )}
      </section>
    </div>
  );
}
