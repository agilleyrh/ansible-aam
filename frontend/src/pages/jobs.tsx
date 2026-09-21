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
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { PageHeader } from "../components/page-header";
import { DonutChart } from "../components/charts";
import { StatCard } from "../components/stat-card";
import { StatusPill } from "../components/status-pill";
import { serviceLabel } from "../monitoring";
import type { ControllerJob, EnvironmentSummary, FleetJobsResponse, OrchestratorApproval } from "../types";
import { deploymentTypeLabel, environmentKind, formatDateTime } from "../utils";

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

const SOURCE_FILTERS = [
  { value: "all", label: "All sources" },
  { value: "controller", label: "Controller jobs" },
  { value: "orchestrator", label: "Orchestrator executions" },
];

function cancelAction(job: ControllerJob): "cancel_job" | "cancel_workflow_job" | "cancel_execution" {
  if ((job.source ?? "controller") === "orchestrator") {
    return "cancel_execution";
  }
  return (job.job_type ?? "").toLowerCase().includes("workflow") ? "cancel_workflow_job" : "cancel_job";
}

function canCancel(job: ControllerJob): boolean {
  const source = job.source ?? "controller";
  const active = ["running", "pending", "waiting", "new"].includes(job.status.toLowerCase());
  return active && (source === "controller" || source === "orchestrator");
}

function resolveJobUrl(job: ControllerJob): string | null {
  if (job.url && /^https?:\/\//i.test(job.url)) {
    return job.url;
  }
  return null;
}

export function JobsPage() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<FleetJobsResponse | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "active");
  const [environmentFilter, setEnvironmentFilter] = useState(searchParams.get("environmentId") || "all");
  const [sourceFilter, setSourceFilter] = useState(searchParams.get("source") || "all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<OrchestratorApproval[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await api.jobs({
      status: statusFilter === "all" ? undefined : statusFilter,
      environmentId: environmentFilter === "all" ? undefined : environmentFilter,
      limitPerEnvironment: 30,
    });
    setData(response);
  }, [environmentFilter, statusFilter]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([load(), api.environments(), api.approvals()])
      .then(([, envItems, approvalItems]) => {
        setEnvironments(envItems);
        setApprovals(approvalItems);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      load().catch((err: Error) => setError(err.message));
      api.approvals().then(setApprovals).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function cancelJob(job: ControllerJob) {
    setCancelingId(`${job.source ?? "controller"}:${job.environment_id}:${job.id}`);
    setError(null);
    setMessage(null);
    try {
      await api.executeAction({
        environment_id: job.environment_id,
        action: cancelAction(job),
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

  async function decideApproval(approval: OrchestratorApproval, decision: "approve" | "reject") {
    setDecidingId(`${approval.environment_id}:${approval.id}:${decision}`);
    setError(null);
    setMessage(null);
    try {
      await api.executeAction({
        environment_id: approval.environment_id,
        action: "decide_approval",
        target_id: approval.id,
        target_name: approval.name,
        payload: { decision },
      });
      setApprovals((current) => current.filter((item) => item.id !== approval.id || item.environment_id !== approval.environment_id));
      setMessage(`${decision === "approve" ? "Approved" : "Rejected"} ${approval.name} on ${approval.environment_name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The approval could not be recorded.");
    } finally {
      setDecidingId(null);
    }
  }

  const stats = data?.stats;
  const jobs = (data?.jobs ?? []).filter((job) => sourceFilter === "all" || (job.source ?? "controller") === sourceFilter);

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Operations"
          title="Fleet jobs and executions"
          description="Watch live controller jobs from AAP estates and workflow executions from Automation Orchestrator estates without leaving the hub."
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
          <StatCard label="Error" value={stats?.error ?? 0} />
          <StatCard label="Successful" value={stats?.successful ?? 0} />
          <StatCard label="Environments" value={stats?.environment_count ?? 0} />
        </Gallery>
      </StackItem>

      {stats ? (
        <StackItem>
          <Card>
            <CardHeader>
              <Title headingLevel="h2" size="lg">
                Outcome mix
              </Title>
            </CardHeader>
            <CardBody>
              <DonutChart
                caption="Jobs"
                slices={[
                  { label: "Running", value: stats.running, color: "var(--pf-t--global--color--status--info--default)" },
                  { label: "Pending", value: stats.pending, color: "var(--pf-t--global--color--status--warning--default)" },
                  { label: "Waiting", value: stats.waiting, color: "var(--pf-t--global--color--brand--default)" },
                  { label: "Failed", value: stats.failed, color: "var(--pf-t--global--color--status--danger--default)" },
                  { label: "Error", value: stats.error, color: "var(--pf-t--global--color--status--danger--default)" },
                  { label: "Successful", value: stats.successful, color: "var(--pf-t--global--color--status--success--default)" },
                  { label: "Canceled", value: stats.canceled, color: "var(--pf-t--global--icon--color--subtle)" },
                ]}
              />
            </CardBody>
          </Card>
        </StackItem>
      ) : null}

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
                  <FormSelectOption
                    key={environment.id}
                    value={environment.id}
                    label={`${environment.name} (${environmentKind(environment) === "orchestrator" ? "Orchestrator" : "AAP"})`}
                  />
                ))}
              </FormSelect>
              <FormSelect
                id="jobs-source-filter"
                value={sourceFilter}
                aria-label="Job source filter"
                onChange={(_, value) => setSourceFilter(value)}
              >
                {SOURCE_FILTERS.map((option) => (
                  <FormSelectOption key={option.value} value={option.value} label={option.label} />
                ))}
              </FormSelect>
            </Gallery>
          </CardBody>
        </Card>
      </StackItem>

      {approvals.length ? (
        <StackItem>
          <Card>
            <CardHeader>
              <Title headingLevel="h2" size="lg">
                Pending approvals
              </Title>
            </CardHeader>
            <CardBody>
              <Table aria-label="Pending Automation Orchestrator approvals" variant="compact">
                <Thead>
                  <Tr>
                    <Th>Approval</Th>
                    <Th>Environment</Th>
                    <Th>Workflow</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {approvals.map((approval) => (
                    <Tr key={`${approval.environment_id}:${approval.id}`}>
                      <Td dataLabel="Approval">
                        <div className="aam-data-list__primary">{approval.name}</div>
                        {approval.message ? <div className="aam-data-list__secondary">{approval.message}</div> : null}
                      </Td>
                      <Td dataLabel="Environment">
                        <Link to={`/environments/${approval.environment_id}`}>{approval.environment_name}</Link>
                      </Td>
                      <Td dataLabel="Workflow">{approval.workflow_name || "—"}</Td>
                      <Td dataLabel="Actions">
                        <div className="aam-link-cluster">
                          <Button
                            variant="primary"
                            size="sm"
                            isLoading={decidingId === `${approval.environment_id}:${approval.id}:approve`}
                            onClick={() => decideApproval(approval, "approve")}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            isLoading={decidingId === `${approval.environment_id}:${approval.id}:reject`}
                            onClick={() => decideApproval(approval, "reject")}
                          >
                            Reject
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </CardBody>
          </Card>
        </StackItem>
      ) : null}

      <StackItem>
        <Card>
          <CardHeader>
            <Title headingLevel="h2" size="lg">
              Live jobs and executions
            </Title>
          </CardHeader>
          <CardBody>
            {loading ? (
              <Bullseye>Loading job activity…</Bullseye>
            ) : jobs.length === 0 ? (
              <EmptyState
                title="No jobs matched"
                description="Register AAP and Orchestrator environments, then refresh to pull live controller jobs and Orchestrator executions."
                icon={ProcessAutomationIcon}
              />
            ) : (
              <Table aria-label="Fleet jobs and Orchestrator executions" variant="compact">
                <Thead>
                  <Tr>
                    <Th>Job</Th>
                    <Th>Source</Th>
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
                    const source = job.source ?? "controller";
                    const cancelKey = `${source}:${job.environment_id}:${job.id}`;
                    const jobUrl = resolveJobUrl(job);
                    return (
                      <Tr key={cancelKey}>
                        <Td dataLabel="Job">
                          <div className="aam-data-list__primary">{job.name}</div>
                          <div className="aam-data-list__secondary">
                            #{job.id}
                            {job.job_type ? ` · ${job.job_type}` : ""}
                          </div>
                        </Td>
                        <Td dataLabel="Source">{serviceLabel(source)}</Td>
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
                          <div className="aam-link-cluster">
                            {jobUrl ? (
                              <Button component="a" href={jobUrl} target="_blank" rel="noreferrer" variant="link" isInline>
                                Open
                              </Button>
                            ) : null}
                            {canCancel(job) ? (
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                isLoading={cancelingId === cancelKey}
                                onClick={() => cancelJob(job)}
                              >
                                Cancel
                              </Button>
                            ) : null}
                            {!jobUrl && !canCancel(job) ? "—" : null}
                          </div>
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
