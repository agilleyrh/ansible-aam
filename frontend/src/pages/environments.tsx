import { useEffect, useState } from "react";

import {
  Alert,
  Bullseye,
  Button,
  Card,
  CardBody,
  CardHeader,
  Gallery,
  Grid,
  GridItem,
  Modal,
  Stack,
  StackItem,
  Text,
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
import type { EnvironmentMutationPayload, EnvironmentSummary } from "../types";
import { formatDateTime } from "../utils";

function getServiceStatuses(summary: Record<string, unknown>): Array<{ service: string; health: string }> {
  const serviceSummaries = summary.service_summaries;
  if (!serviceSummaries || typeof serviceSummaries !== "object" || Array.isArray(serviceSummaries)) {
    return [];
  }

  return Object.entries(serviceSummaries)
    .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[1]) && typeof entry[1] === "object" && !Array.isArray(entry[1]))
    .map(([service, value]) => ({
      service,
      health: typeof value.health === "string" ? value.health : "unknown",
    }));
}

export function EnvironmentsPage() {
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to queue a sync.");
    } finally {
      setSyncingId(null);
    }
  }

  const healthyCount = environments.filter((environment) => environment.status === "healthy").length;
  const warningCount = environments.filter((environment) => environment.status === "warning").length;
  const criticalCount = environments.filter((environment) => environment.status === "critical").length;

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Environments"
          title="Environment registry"
          description="Register platform gateways, keep the registry clean, and move deeper settings into each environment once the connection is established."
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
          <StatCard label="Registered" value={environments.length} detail="AAP environments tracked by the hub" />
          <StatCard label="Healthy" value={healthyCount} detail="No active sync or service issues" />
          <StatCard label="Warning" value={warningCount} detail="Needs follow-up or attention" />
          <StatCard label="Critical" value={criticalCount} detail="Recent failures or missing services" />
        </Gallery>
      </StackItem>

      <StackItem>
        <Card isFlat>
          <CardHeader>
            <Stack>
              <StackItem>
                <Title headingLevel="h2" size="lg">
                  Registered environments
                </Title>
              </StackItem>
              <StackItem>
                <Text component="p" className="aam-muted">
                  Registration is intentionally focused. Use the environment detail view for advanced service path overrides, platform declarations, and direct actions.
                </Text>
              </StackItem>
            </Stack>
          </CardHeader>
          <CardBody>
            {loading ? (
              <Bullseye>
                <Text component="p" className="aam-muted">
                  Loading environments...
                </Text>
              </Bullseye>
            ) : environments.length === 0 ? (
              <EmptyState
                title="No environments registered"
                description="Register your first Ansible Automation Platform deployment to start collecting health, inventory, and governance data."
                action={
                  <Button type="button" variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                    Register environment
                  </Button>
                }
              />
            ) : (
              <Gallery hasGutter minWidths={{ default: "320px", xl: "360px" }}>
                {environments.map((environment) => {
                  const serviceStatuses = getServiceStatuses(environment.summary);

                  return (
                    <Card key={environment.id} isFlat isFullHeight>
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
                            <Text component="small" className="aam-muted">
                              {environment.groupings.join(", ") || environment.slug}
                            </Text>
                          </StackItem>
                        </Stack>
                      </CardHeader>
                      <CardBody>
                        <Stack hasGutter>
                          <StackItem>
                            <Grid hasGutter>
                              <GridItem md={4}>
                                <Text component="small" className="aam-muted">
                                  Status
                                </Text>
                                <div>
                                  <StatusPill status={environment.status} />
                                </div>
                              </GridItem>
                              <GridItem md={4}>
                                <Text component="small" className="aam-muted">
                                  Version
                                </Text>
                                <div>{environment.platform_version ?? "Unknown"}</div>
                              </GridItem>
                              <GridItem md={4}>
                                <Text component="small" className="aam-muted">
                                  Last sync
                                </Text>
                                <div>{formatDateTime(environment.last_synced_at)}</div>
                              </GridItem>
                            </Grid>
                          </StackItem>
                          <StackItem>
                            <Text component="small" className="aam-muted">
                              Service posture
                            </Text>
                            {serviceStatuses.length === 0 ? (
                              <div className="aam-muted">No service data collected yet.</div>
                            ) : (
                              <div className="aam-link-cluster">
                                {serviceStatuses.map((item) => (
                                  <div key={`${environment.id}-${item.service}`}>
                                    <Text component="small" className="aam-muted">
                                      {item.service.toUpperCase()}
                                    </Text>
                                    <div>
                                      <StatusPill status={item.health} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </StackItem>
                          <StackItem>
                            <Text component="small" className="aam-muted">
                              Health score
                            </Text>
                            <div>{String(environment.summary.health_score ?? "n/a")}</div>
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
        title="Register environment"
        isOpen={isCreateModalOpen}
        onClose={() => {
          if (!busy) {
            setIsCreateModalOpen(false);
          }
        }}
      >
        <Stack hasGutter>
          <StackItem>
            <Text component="p" className="aam-muted">
              Start with the connection, sync cadence, and collector credentials. Deeper platform declarations stay available after the environment is created.
            </Text>
          </StackItem>
          <StackItem>
            <EnvironmentForm
              mode="create"
              title="Register environment"
              description="Create a managed environment record with its gateway, services, and collection credentials."
              submitLabel="Register environment"
              busy={busy}
              errorMessage={error}
              onSubmit={handleCreate}
              variant="plain"
              showAdvancedSettings={false}
            />
          </StackItem>
        </Stack>
      </Modal>
    </Stack>
  );
}
