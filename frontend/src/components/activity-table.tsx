import type { ReactNode } from "react";

import {
  DataList,
  DataListCell,
  DataListItem,
  DataListItemCells,
  DataListItemRow,
  Flex,
  Label,
  Text,
} from "@patternfly/react-core";
import { Link } from "react-router-dom";

import { StatusPill } from "./status-pill";
import type { ActivityEvent } from "../types";
import { formatDateTime, humanize } from "../utils";

type Props = {
  items: ActivityEvent[];
  showEnvironment?: boolean;
};

export function ActivityTable({ items, showEnvironment = true }: Props) {
  return (
    <DataList aria-label="Activity events" isCompact>
      {items.map((item) => {
        const rowId = `${item.kind}-${item.id}`;
        const cells: ReactNode[] = [
          <DataListCell key="time" width={1}>
            <Text component="small" className="aam-muted">
              Time
            </Text>
            <div className="aam-data-list__primary">{formatDateTime(item.finished_at ?? item.started_at ?? item.created_at)}</div>
          </DataListCell>,
          showEnvironment ? (
            <DataListCell key="environment" width={2}>
              <Text component="small" className="aam-muted">
                Environment
              </Text>
              <div className="aam-data-list__primary">
                <Link to={`/environments/${item.environment_id}`}>{item.environment_name}</Link>
              </div>
            </DataListCell>
          ) : null,
          <DataListCell key="operation" width={3} isFilled>
            <div id={`${rowId}-summary`} className="aam-data-list__primary">
              {item.summary}
            </div>
            <Flex className="aam-data-list__meta" gap={{ default: "gapXs" }} flexWrap={{ default: "wrap" }}>
              <Label isCompact color="blue">
                {humanize(item.kind)}
              </Label>
              <Label isCompact color="grey">
                {item.service}
              </Label>
              <Label isCompact color="cyan">
                {humanize(item.operation)}
              </Label>
            </Flex>
          </DataListCell>,
          <DataListCell key="target" width={2}>
            <Text component="small" className="aam-muted">
              Target
            </Text>
            <div className="aam-data-list__primary">{item.target}</div>
            <div className="aam-data-list__secondary">Requested by {item.requested_by}</div>
          </DataListCell>,
          <DataListCell key="status" width={1} alignRight>
            <StatusPill status={item.status} />
          </DataListCell>,
        ].filter(Boolean);

        return (
          <DataListItem key={rowId} id={rowId} aria-labelledby={`${rowId}-summary`}>
            <DataListItemRow>
              <DataListItemCells dataListCells={cells} />
            </DataListItemRow>
          </DataListItem>
        );
      })}
    </DataList>
  );
}
