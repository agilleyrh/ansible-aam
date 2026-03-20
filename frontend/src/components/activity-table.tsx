import { Link } from "react-router-dom";

import { StatusPill } from "./status-pill";
import type { ActivityEvent } from "../types";

type Props = {
  items: ActivityEvent[];
  showEnvironment?: boolean;
};

function formatWhen(item: ActivityEvent) {
  const timestamp = item.finished_at ?? item.started_at ?? item.created_at;
  return new Date(timestamp).toLocaleString();
}

export function ActivityTable({ items, showEnvironment = true }: Props) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>Time</th>
            {showEnvironment ? <th>Environment</th> : null}
            <th>Operation</th>
            <th>Target</th>
            <th>Requested by</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.kind}-${item.id}`}>
              <td>{formatWhen(item)}</td>
              {showEnvironment ? (
                <td>
                  <Link to={`/environments/${item.environment_id}`}>{item.environment_name}</Link>
                </td>
              ) : null}
              <td>
                <div className="table-primary">
                  <span>{item.summary}</span>
                  <span>
                    {item.kind} · {item.service} · {item.operation.replaceAll("_", " ")}
                  </span>
                </div>
              </td>
              <td>{item.target}</td>
              <td>{item.requested_by}</td>
              <td>
                <StatusPill status={item.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
