import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Bullseye,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormSelect,
  FormSelectOption,
  Gallery,
  Stack,
  StackItem,
  Title,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { ProcessAutomationIcon } from "@patternfly/react-icons";
import { Link } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { PageHeader } from "../components/page-header";
import { StatCard } from "../components/stat-card";
import { StatusPill } from "../components/status-pill";
import type { ControllerJob, EnvironmentSummary, FleetJobsResponse } from "../types";
import { deploymentTypeLabel, formatDateTime } from "../utils";

const STATUS_FILTERS = [
  { value: "active", label: "Active (running / pending / waiting)" },
  { value: "running", label: "Running" },
  { value: "pending", label: "Pending" },
  { value: "waiting", label: "Waiting" },
  { value: "failed", label: "Failed" },
  { value: "successful", label: "Successful" },
  { value: "canceled", label: "Canceled" },
  { value: "all", label: "All recent" },
];

function canCancel(status: string): boolean {
  return ["running", "pending", "waiting", "new"].includes(status.toLowerCase());
}

export function JobsPage() {
  const [data, setData] = useState<FleetJobsResponse | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState("active");
  const [environmentFilter, setEnvironmentFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const statusParam =
      statusFilter === "all" ? undefined : statusFilter === "active" ? undefined : statusFilter;
    const response = await api.jobs({
      status: statusParam,
      environmentId: environmentFilter === "all" ? undefined : environmentFilter,
      limitPerEnvironment: 30,
    });

    if (statusFilter === "active") {
      response.jobs = response.jobs.filter((job) => canCancel(job.status) || job.status === "running");
    }

    setData(response);
  }, [environmentFilter, statusFilter]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([load(), api.environments()])
      .then(([, envItems]) => setEnvironments(envItems))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  async function cancelJob(job: ControllerJob) {
    setCancelingId(`${job.environment_id}:${job.id}`);
    setError(null);
    setMessage(null);
    try {
      await api.executeAction({
        environment_id: job.environment_id,
        action: "cancel_job",
        target_id: job.id,
        target_name: job.name,
      });
      setMessage(`Requested cancel for ${job.name} on ${job.environment_name}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel job.");
    } finally {
      setCancelingId(null);
    }
  }

  const stats = data?.stats;
  const jobs = data?.jobs ?? [];

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Operations"
          title="Fleet jobs"
          description="Watch live controller job pressure across every registered AAP environment and cancel active work without leaving the hub."
          actions={
            <Button type="button" variant="secondary" onClick={() => load().catch((err: Error) => setError(err.message))}>
              Refresh
            </Button>
          }
        />
      </StackItem>

      {error ? (
        <StackItem>
          <Alert isInline variant="danger" title={error} />
        </StackItem>
      ) : null}
      {message ? (
        <StackItem>
          <Alert isInline variant="success" title={message} />
        </StackItem>
      ) : null}

      <StackItem>
        <Gallery hasGutter minWidths={{ default: "12rem" }}>
          <StatCard label="Running" value={stats?.running ?? 0} />
          <StatCard label="Pending" value={stats?.pending ?? 0} />
          <StatCard label="Waiting" value={stats?.waiting ?? 0} />
          <StatCard label="Failed" value={stats?.failed ?? 0} />
          <StatCard label="Successful" value={stats?.successful ?? 0} />
          <StatCard label="Environments" value={stats?.environment_count ?? 0} />
        </Gallery>
      </StackItem>

      <StackItem>
        <Card>
          <CardHeader>
            <Title headingLevel="h2" size="lg">
              Filters
            </Title>
          </CardHeader>
          <CardBody>
            <Gallery hasGutter minWidths={{ default: "16rem" }}>
              <FormSelect
                id="jobs-status-filter"
                value={statusFilter}
                aria-label="Job status filter"
                onChange={(_, value) => setStatusFilter(value)}
              >
                {STATUS_FILTERS.map((option) => (
                  <FormSelectOption key={option.value} value={option.value} label={option.label} />
                ))}
              </FormSelect>
              <FormSelect
                id="jobs-environment-filter"
                value={environmentFilter}
                aria-label="Environment filter"
                onChange={(_, value) => setEnvironmentFilter(value)}
              >
                <FormSelectOption value="all" label="All environments" />
                {environments.map((environment) => (
                  <FormSelectOption key={environment.id} value={environment.id} label={environment.name} />
                ))}
              </FormSelect>
            </Gallery>
          </CardBody>
        </Card>
      </StackItem>

      <StackItem>
        <Card>
          <CardHeader>
            <Title headingLevel="h2" size="lg">
              Live jobs
            </Title>
          </CardHeader>
          <CardBody>
            {loading ? (
              <Bullseye>Loading job activity…</Bullseye>
            ) : jobs.length === 0 ? (
              <EmptyState
                title="No jobs matched"
                description="Register environments with controller endpoints, then refresh to pull live job activity."
                icon={ProcessAutomationIcon}
              />
            ) : (
              <Table aria-label="Fleet controller jobs" variant="compact">
                <Thead>
                  <Tr>
                    <Th>Job</Th>
                    <Th>Environment</Th>
                    <Th>Infrastructure</Th>
                    <Th>Status</Th>
                    <Th>Started</Th>
                    <Th>Elapsed</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {jobs.map((job) => {
                    const cancelKey = `${job.environment_id}:${job.id}`;
                    return (
                      <Tr key={cancelKey}>
                        <Td dataLabel="Job">
                          <div className="aam-data-list__primary">{job.name}</div>
                          <div className="aam-data-list__secondary">#{job.id}{job.job_type ? ` · ${job.job_type}` : ""}</div>
                        </Td>
                        <Td dataLabel="Environment">
                          <Link to={`/environments/${job.environment_id}`}>{job.environment_name}</Link>
                        </Td>
                        <Td dataLabel="Infrastructure">{deploymentTypeLabel(job.deployment_type)}</Td>
                        <Td dataLabel="Status">
                          <StatusPill status={job.status} />
                        </Td>
                        <Td dataLabel="Started">{job.started ? formatDateTime(job.started) : "—"}</Td>
                        <Td dataLabel="Elapsed">{typeof job.elapsed === "number" ? `${Math.round(job.elapsed)}s` : "—"}</Td>
                        <Td dataLabel="Actions">
                          {canCancel(job.status) ? (
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              isLoading={cancelingId === cancelKey}
                              onClick={() => cancelJob(job)}
                            >
                              Cancel
                            </Button>
                          ) : (
                            "—"
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </StackItem>
    </Stack>
  );
}
