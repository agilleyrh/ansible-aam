import { useEffect, useState } from "react";

import { Alert, Bullseye, Button, Card, CardBody, CardHeader, Grid, GridItem, Stack, StackItem, Text, Title } from "@patternfly/react-core";
import { Link } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { EnvironmentForm } from "../components/environment-form";
import { LinkButton } from "../components/link-button";
import { PageHeader } from "../components/page-header";
import { StatusPill } from "../components/status-pill";
import type { EnvironmentMutationPayload, EnvironmentSummary } from "../types";
import { formatDateTime } from "../utils";

export function EnvironmentsPage() {
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Environments"
          title="Register and manage AAP environments"
          description="Add platform gateway endpoints, controller APIs, EDA services, and automation hubs that should be collected and governed."
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
        <Grid hasGutter>
          <GridItem lg={5}>
            <Card isFlat isFullHeight>
              <CardHeader>
                <Stack>
                  <StackItem>
                    <Title headingLevel="h2" size="lg">
                      Registered environments
                    </Title>
                  </StackItem>
                  <StackItem>
                    <Text component="p" className="aam-muted">
                      {environments.length === 0
                        ? "No AAP environments are registered yet."
                        : "Use the detail view to edit credentials, service endpoints, and sync settings."}
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
                    description="Use the registration form to add your first Ansible Automation Platform deployment."
                  />
                ) : (
                  <Stack hasGutter>
                    {environments.map((environment) => (
                      <Card key={environment.id} isFlat isCompact>
                        <CardBody>
                          <Stack hasGutter>
                            <StackItem>
                              <Link to={`/environments/${environment.id}`}>
                                <Title headingLevel="h3" size="md">
                                  {environment.name}
                                </Title>
                              </Link>
                              <Text component="small" className="aam-muted">
                                {environment.groupings.join(", ") || environment.slug}
                              </Text>
                            </StackItem>
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
                                    Owner
                                  </Text>
                                  <div>{environment.owner || "Unassigned"}</div>
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
                              <LinkButton to={`/environments/${environment.id}`} variant="secondary" size="sm">
                                View details
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
                    ))}
                  </Stack>
                )}
              </CardBody>
            </Card>
          </GridItem>
          <GridItem lg={7}>
            <EnvironmentForm
              mode="create"
              title="Register environment"
              description="Create a managed environment record with its gateway, services, and collection credentials."
              submitLabel="Register environment"
              busy={busy}
              errorMessage={error}
              onSubmit={handleCreate}
            />
          </GridItem>
        </Grid>
      </StackItem>
    </Stack>
  );
}
