import { useEffect, useState } from "react";

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
  Grid,
  GridItem,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
  Stack,
  StackItem,
  Content,
  Title,
} from "@patternfly/react-core";
import { Link } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { EnvironmentForm } from "../components/environment-form";
import { LinkButton } from "../components/link-button";
import { PageHeader } from "../components/page-header";
import { StatCard } from "../components/stat-card";
import { StatusPill } from "../components/status-pill";
import { serviceLabels } from "../monitoring";
import type { EnvironmentMutationPayload, EnvironmentSummary } from "../types";
import { deploymentTypeLabel, environmentKind, environmentKindLabel, formatDateTime } from "../utils";

function healthScoreStatus(score: unknown): string {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "unknown";
  }
  if (score >= 80) {
    return "healthy";
  }
  if (score >= 50) {
    return "warning";
  }
  return "critical";
}

function getServiceStatuses(environment: EnvironmentSummary): Array<{ service: string; health: string }> {
  const serviceSummaries = environment.summary.service_summaries;
  if (!serviceSummaries || typeof serviceSummaries !== "object" || Array.isArray(serviceSummaries)) {
    return [];
  }

  const order = environmentKind(environment) === "orchestrator" ? ["orchestrator"] : ["gateway", "controller", "eda", "hub"];

  return Object.entries(serviceSummaries)
    .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[1]) && typeof entry[1] === "object" && !Array.isArray(entry[1]))
    .map(([service, value]) => ({
      service,
      health: typeof value.health === "string" ? value.health : "unknown",
    }))
    .sort((left, right) => {
      return (order.indexOf(left.service) === -1 ? 50 : order.indexOf(left.service)) - (order.indexOf(right.service) === -1 ? 50 : order.indexOf(right.service));
    });
}

export function EnvironmentsPage() {
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");

  async function loadEnvironments() {
    const items = await api.environments();
    setEnvironments(items);
  }

  useEffect(() => {
    loadEnvironments()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
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
      setIsCreateModalOpen(false);
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
      await loadEnvironments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to queue a sync.");
    } finally {
      setSyncingId(null);
    }
  }

  const groups = Array.from(new Set(environments.flatMap((environment) => environment.groupings))).sort();
  const kindFiltered =
    kindFilter === "all"
      ? environments
      : environments.filter((environment) => environmentKind(environment) === kindFilter);
  const visibleEnvironments =
    groupFilter === "all"
      ? kindFiltered
      : groupFilter === "ungrouped"
        ? kindFiltered.filter((environment) => environment.groupings.length === 0)
        : kindFiltered.filter((environment) => environment.groupings.includes(groupFilter));
  const aapCount = environments.filter((environment) => environmentKind(environment) === "aap").length;
  const orchestratorCount = environments.filter((environment) => environmentKind(environment) === "orchestrator").length;
  const healthyCount = visibleEnvironments.filter((environment) => environment.status === "healthy").length;
  const warningCount = visibleEnvironments.filter((environment) => environment.status === "warning").length;
  const criticalCount = visibleEnvironments.filter((environment) => environment.status === "critical").length;

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Environments"
          title="Environment registry"
          description="Register Ansible Automation Platform and Automation Orchestrator as separate estates. Each listing has its own infrastructure, credentials, health, and inventory."
          actions={
            <>
              <LinkButton to="/monitoring" variant="secondary">
                View fleet monitoring
              </LinkButton>
              <Button type="button" variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                Register environment
              </Button>
            </>
          }
        />
      </StackItem>

      {message ? (
        <StackItem>
          <Alert isInline variant="success" title={message} />
        </StackItem>
      ) : null}
      {error ? (
        <StackItem>
          <Alert isInline variant="danger" title={error} />
        </StackItem>
      ) : null}

      <StackItem>
        <Gallery hasGutter minWidths={{ default: "180px", lg: "220px" }}>
          <StatCard label="Registered" value={visibleEnvironments.length} detail="AAP and Orchestrator estates in this view" />
          <StatCard label="AAP" value={aapCount} detail="Ansible Automation Platform environments" />
          <StatCard label="Orchestrator" value={orchestratorCount} detail="Automation Orchestrator environments" />
          <StatCard label="Healthy" value={healthyCount} detail="No active sync or service issues" />
          <StatCard label="Warning" value={warningCount} detail="Needs follow-up or attention" />
          <StatCard label="Critical" value={criticalCount} detail="Recent failures or missing services" />
        </Gallery>
      </StackItem>

      <StackItem>
        <Card >
          <CardHeader>
            <Stack>
              <StackItem>
                <Title headingLevel="h2" size="lg">
                  Registered environments
                </Title>
              </StackItem>
              <StackItem>
                <Content component="p" className="aam-muted">
                  Registration is intentionally focused. Use the environment detail view for advanced service path overrides, platform declarations, and direct actions.
                </Content>
              </StackItem>
              {environments.length > 0 ? (
                <StackItem>
                  <Grid hasGutter>
                    <GridItem md={6}>
                      <FormSelect
                        id="environment-kind-filter"
                        value={kindFilter}
                        aria-label="Filter environments by product"
                        onChange={(_, value) => setKindFilter(value)}
                      >
                        <FormSelectOption value="all" label="All products" />
                        <FormSelectOption value="aap" label="Ansible Automation Platform" />
                        <FormSelectOption value="orchestrator" label="Automation Orchestrator" />
                      </FormSelect>
                    </GridItem>
                    <GridItem md={6}>
                      <FormSelect
                        id="environment-group-filter"
                        value={groupFilter}
                        aria-label="Filter environments by group"
                        onChange={(_, value) => setGroupFilter(value)}
                      >
                        <FormSelectOption value="all" label="All groups" />
                        <FormSelectOption value="ungrouped" label="Ungrouped" />
                        {groups.map((group) => (
                          <FormSelectOption key={group} value={group} label={group} />
                        ))}
                      </FormSelect>
                    </GridItem>
                  </Grid>
                </StackItem>
              ) : null}
            </Stack>
          </CardHeader>
          <CardBody>
            {loading ? (
              <Bullseye>
                <Content component="p" className="aam-muted">
                  Loading environments...
                </Content>
              </Bullseye>
            ) : environments.length === 0 ? (
              <EmptyState
                title="No environments registered"
                description="Register your first Ansible Automation Platform or Automation Orchestrator estate to start collecting health, inventory, and governance data."
                action={
                  <Button type="button" variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                    Register environment
                  </Button>
                }
              />
            ) : visibleEnvironments.length === 0 ? (
              <EmptyState
                title="No environments in this group"
                description="Choose a different group, or register an environment and assign it to a group."
                action={
                  <Button type="button" variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                    Register environment
                  </Button>
                }
              />
            ) : (
              <Gallery hasGutter minWidths={{ default: "320px", xl: "360px" }}>
                {visibleEnvironments.map((environment) => {
                  const serviceStatuses = getServiceStatuses(environment);

                  return (
                    <Card key={environment.id}  isFullHeight>
                      <CardHeader>
                        <Stack hasGutter>
                          <StackItem>
                            <Link to={`/environments/${environment.id}`}>
                              <Title headingLevel="h3" size="lg">
                                {environment.name}
                              </Title>
                            </Link>
                          </StackItem>
                          <StackItem>
                            <Label color={environmentKind(environment) === "orchestrator" ? "purple" : "blue"} isCompact>
                              {environmentKindLabel(environment)}
                            </Label>
                          </StackItem>
                          <StackItem>
                            <Content component="small" className="aam-muted">
                              {environment.groupings.join(", ") || environment.slug}
                            </Content>
                          </StackItem>
                        </Stack>
                      </CardHeader>
                      <CardBody>
                        <Stack hasGutter>
                          <StackItem>
                            <Grid hasGutter>
                              <GridItem md={3}>
                                <Content component="small" className="aam-muted">
                                  Status
                                </Content>
                                <div>
                                  <StatusPill status={environment.status} />
                                </div>
                              </GridItem>
                              <GridItem md={3}>
                                <Content component="small" className="aam-muted">
                                  Infrastructure
                                </Content>
                                <div className="aam-deployment-badge">{deploymentTypeLabel(environment.deployment_type)}</div>
                              </GridItem>
                              <GridItem md={3}>
                                <Content component="small" className="aam-muted">
                                  Version
                                </Content>
                                <div>{environment.platform_version ?? "Unknown"}</div>
                              </GridItem>
                              <GridItem md={3}>
                                <Content component="small" className="aam-muted">
                                  Last sync
                                </Content>
                                <div>{formatDateTime(environment.last_synced_at)}</div>
                              </GridItem>
                            </Grid>
                          </StackItem>
                          <StackItem>
                            <Content component="small" className="aam-muted">
                              Service posture
                            </Content>
                            {serviceStatuses.length === 0 ? (
                              <div className="aam-muted">No service data collected yet.</div>
                            ) : (
                              <div className="aam-link-cluster">
                                {serviceStatuses.map((item) => (
                                  <div key={`${environment.id}-${item.service}`}>
                                    <Content component="small" className="aam-muted">
                                      {serviceLabels[item.service] ?? item.service}
                                    </Content>
                                    <div>
                                      <StatusPill status={item.health} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </StackItem>
                          <StackItem>
                            <Content component="small" className="aam-muted">
                              Health score
                            </Content>
                            <div className="aam-link-cluster">
                              <StatusPill status={healthScoreStatus(environment.summary.health_score)} />
                              <span>{typeof environment.summary.health_score === "number" ? environment.summary.health_score : "n/a"}</span>
                            </div>
                          </StackItem>
                          <StackItem>
                            <LinkButton to={`/environments/${environment.id}`} variant="secondary" size="sm">
                              Open environment
                            </LinkButton>{" "}
                            <Button
                              type="button"
                              variant="link"
                              isInline
                              isLoading={syncingId === environment.id}
                              isDisabled={syncingId === environment.id}
                              onClick={() => queueSync(environment)}
                            >
                              {syncingId === environment.id ? "Queueing..." : "Queue sync"}
                            </Button>
                          </StackItem>
                        </Stack>
                      </CardBody>
                    </Card>
                  );
                })}
              </Gallery>
            )}
          </CardBody>
        </Card>
      </StackItem>

      <Modal
        variant="large"
        isOpen={isCreateModalOpen}
        onClose={() => {
          if (!busy) {
            setIsCreateModalOpen(false);
          }
        }}
        aria-labelledby="register-environment-title"
      >
        <ModalHeader title="Register environment" labelId="register-environment-title" />
        <ModalBody>
          <Stack hasGutter>
            <StackItem>
              <Content component="p" className="aam-muted">
                Start with the connection, sync cadence, collector credentials, and infrastructure footprint. Deeper
                platform declarations stay available after the environment is created.
              </Content>
            </StackItem>
            <StackItem>
              <EnvironmentForm
                mode="create"
                title="Register environment"
                description="Create a managed environment record. Choose Ansible Automation Platform or Automation Orchestrator — each is a separate estate with its own URL and credentials."
                submitLabel="Register environment"
                busy={busy}
                errorMessage={error}
                onSubmit={handleCreate}
                variant="plain"
                showAdvancedSettings={false}
              />
            </StackItem>
          </Stack>
        </ModalBody>
      </Modal>
    </Stack>
  );
}
