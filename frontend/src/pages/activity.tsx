import { useEffect, useState } from "react";

import { Alert, Bullseye, Card, CardBody, CardHeader, FormSelect, FormSelectOption, Gallery, Stack, StackItem, Text, Title } from "@patternfly/react-core";

import { api } from "../api";
import { ActivityTable } from "../components/activity-table";
import { EmptyState } from "../components/empty-state";
import { LinkButton } from "../components/link-button";
import { PageHeader } from "../components/page-header";
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
      .catch((err: Error) => {
        if (!controller.signal.aborted) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [selectedEnvironmentId]);

  if (loading && items.length === 0) {
    return (
      <Bullseye>
        <Card isFlat>
          <CardBody>Loading activity stream...</CardBody>
        </Card>
      </Bullseye>
    );
  }

  if (error && items.length === 0) {
    return <Alert isInline variant="danger" title={`Activity stream unavailable: ${error}`} />;
  }

  const syncCount = items.filter((item) => item.kind === "sync").length;
  const actionCount = items.filter((item) => item.kind === "action").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const activeCount = items.filter((item) => item.status === "queued" || item.status === "running").length;

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Activity"
          title="Fleet activity stream"
          description="Review syncs, remote launches, repository syncs, and activation changes across the managed automation estate."
          actions={
            <>
              <LinkButton to="/environments" variant="secondary">
                Open environment registry
              </LinkButton>
              <FormSelect value={selectedEnvironmentId} onChange={(_, value) => setSelectedEnvironmentId(value)} aria-label="Filter activity by environment">
                <FormSelectOption value="all" label="All environments" />
                {environments.map((environment) => (
                  <FormSelectOption key={environment.id} value={environment.id} label={environment.name} />
                ))}
              </FormSelect>
            </>
          }
        />
      </StackItem>

      {error && items.length > 0 ? (
        <StackItem>
          <Alert isInline variant="warning" title={`Refresh issue: ${error}`} />
        </StackItem>
      ) : null}

      <StackItem>
        <Gallery hasGutter minWidths={{ default: "180px", lg: "220px" }}>
          <StatCard label="Events" value={items.length} detail="Latest stream entries loaded" />
          <StatCard label="Sync jobs" value={syncCount} detail="Collection and policy evaluation runs" />
          <StatCard label="Remote actions" value={actionCount} detail="Operator-initiated actions on managed services" />
          <StatCard label="Needs attention" value={failedCount + activeCount} detail="Failed, queued, or running events" />
        </Gallery>
      </StackItem>

      <StackItem>
        <Card isFlat>
          <CardHeader>
            <Stack>
              <StackItem>
                <Title headingLevel="h2" size="lg">
                  Recent activity
                </Title>
              </StackItem>
              <StackItem>
                <Text component="p" className="aam-muted">
                  Ordered newest first and aligned to the activity-stream pattern used across controller and AAP.
                </Text>
              </StackItem>
            </Stack>
          </CardHeader>
          <CardBody>
            {loading && items.length > 0 ? (
              <Alert isInline variant="info" title="Refreshing activity stream..." />
            ) : items.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Register an environment, queue a sync, or run a remote action to start populating the stream."
              />
            ) : (
              <ActivityTable items={items} showEnvironment={selectedEnvironmentId === "all"} />
            )}
          </CardBody>
        </Card>
      </StackItem>
    </Stack>
  );
}
