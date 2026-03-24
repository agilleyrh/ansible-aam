import { useEffect, useState } from "react";

import {
  Alert,
  Bullseye,
  Button,
  Card,
  CardBody,
  CardHeader,
  CodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  FormSelect,
  FormSelectOption,
  Gallery,
  Grid,
  GridItem,
  SearchInput,
  Stack,
  StackItem,
  Tab,
  Tabs,
  Text,
  Title,
} from "@patternfly/react-core";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../api";
import { describeCapabilityProfile, parseCapabilityProfile } from "../capabilities";
import { ActivityTable } from "../components/activity-table";
import { EmptyState } from "../components/empty-state";
import { EnvironmentForm } from "../components/environment-form";
import { LinkButton } from "../components/link-button";
import { MetricBarChart } from "../components/metric-bar-chart";
import { PageHeader } from "../components/page-header";
import { StatCard } from "../components/stat-card";
import { StatusPill } from "../components/status-pill";
import {
  formatMonitoringValue,
  getCollectionProfile,
  getHealthScore,
  getMonitoringValue,
  getSnapshotHealth,
  monitoredServices,
  monitoringPointGroups,
} from "../monitoring";
import type { ActivityEvent, EnvironmentDetail, EnvironmentMutationPayload, RemoteActionName, Resource } from "../types";
import { formatDateTime, humanize, stringifyValue } from "../utils";

type ResourceAction = {
  action: RemoteActionName;
  label: string;
  payload?: Record<string, unknown>;
};

function buildResourceAction(resource: Resource): ResourceAction | null {
  if (resource.service === "controller" && resource.resource_type === "job_template") {
    return { action: "launch_job_template", label: "Launch template" };
  }
  if (resource.service === "controller" && resource.resource_type === "workflow_job_template") {
    return { action: "launch_workflow_job_template", label: "Launch workflow" };
  }
  if (resource.service === "controller" && resource.resource_type === "project") {
    return { action: "sync_project", label: "Sync project" };
  }
  if (resource.service === "eda" && resource.resource_type === "activation") {
    const enabled = resource.status !== "disabled";
    return {
      action: "set_activation_state",
      label: enabled ? "Disable activation" : "Enable activation",
      payload: { enabled: !enabled },
    };
  }
  if (resource.service === "hub" && resource.resource_type === "repository") {
    return { action: "sync_repository", label: "Sync repository" };
  }
  return null;
}

function actionSuccessMessage(action: ResourceAction, resource: Resource) {
  if (action.action === "set_activation_state") {
    return `${action.payload?.enabled ? "Enabled" : "Disabled"} ${resource.name}.`;
  }
  return `${action.label} queued for ${resource.name}.`;
}

export function EnvironmentDetailPage() {
  const { environmentId } = useParams();
  const navigate = useNavigate();
  const [environment, setEnvironment] = useState<EnvironmentDetail | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [activeTabKey, setActiveTabKey] = useState<string | number>("overview");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadEnvironment(signal?: AbortSignal) {
    if (!environmentId) {
      return;
    }

    const [detailResult, activityResult] = await Promise.allSettled([
      api.environment(environmentId, signal),
      api.activity(environmentId, signal),
    ]);
    if (signal?.aborted) {
      return;
    }
    if (detailResult.status === "fulfilled") {
      setEnvironment(detailResult.value);
      setError(null);
    } else {
      setError(detailResult.reason?.message ?? "Failed to load environment");
    }
    if (activityResult.status === "fulfilled") {
      setActivity(activityResult.value);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadEnvironment(controller.signal).catch((err: Error) => {
      if (!controller.signal.aborted) {
        setError(err.message);
      }
    });
    return () => controller.abort();
  }, [environmentId]);

  async function handleSave(payload: EnvironmentMutationPayload, options: { syncAfterSave: boolean }) {
    if (!environmentId) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updatePayload: Partial<EnvironmentMutationPayload> = { ...payload };
      if (!payload.client_secret) {
        delete updatePayload.client_secret;
      }
      if (!payload.access_token) {
        delete updatePayload.access_token;
      }

      await api.updateEnvironment(environmentId, updatePayload);
      if (options.syncAfterSave) {
        await api.syncEnvironment(environmentId);
        setMessage("Environment settings saved and a sync was queued.");
      } else {
        setMessage("Environment settings saved.");
      }
      await loadEnvironment();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save environment settings.");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    if (!environmentId || !environment) {
      return;
    }

    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      await api.syncEnvironment(environmentId);
      setMessage(`Queued a sync for ${environment.name}.`);
      await loadEnvironment();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to queue a sync.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!environmentId || !environment) {
      return;
    }

    if (!window.confirm(`Delete ${environment.name}? This removes all collected resources, sync history, and policy results for this environment.`)) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.deleteEnvironment(environmentId);
      navigate("/environments");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete the environment.");
      setBusy(false);
    }
  }

  async function handleResourceAction(resource: Resource, action: ResourceAction) {
    if (!environmentId) {
      return;
    }

    setActioningId(`${resource.id}:${action.action}`);
    setError(null);
    setMessage(null);
    try {
      await api.executeAction({
        environment_id: environmentId,
        action: action.action,
        target_id: resource.external_id,
        target_name: resource.name,
        payload: action.payload,
      });
      setMessage(actionSuccessMessage(action, resource));
      await loadEnvironment();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to run ${action.label.toLowerCase()}.`);
    } finally {
      setActioningId(null);
    }
  }

  if (error && !environment) {
    return <Alert isInline variant="danger" title={`Environment unavailable: ${error}`} />;
  }

  if (!environment) {
    return (
      <Bullseye>
        <Card isFlat>
          <CardBody>Loading environment...</CardBody>
        </Card>
      </Bullseye>
    );
  }

  const services = Array.from(new Set(environment.resources.map((resource) => resource.service))).sort();
  const resourceTypes = Array.from(new Set(environment.resources.map((resource) => resource.resource_type))).sort();
  const normalizedQuery = query.trim().toLowerCase();
  const filteredResources = environment.resources.filter((resource) => {
    if (serviceFilter !== "all" && resource.service !== serviceFilter) {
      return false;
    }
    if (typeFilter !== "all" && resource.resource_type !== typeFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }

    const haystack = [resource.name, resource.external_id, resource.resource_type, resource.service, resource.namespace]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const templateCount = environment.resources.filter(
    (resource) => resource.resource_type === "job_template" || resource.resource_type === "workflow_job_template",
  ).length;
  const projectCount = environment.resources.filter((resource) => resource.resource_type === "project").length;
  const activationCount = environment.resources.filter((resource) => resource.resource_type === "activation").length;
  const hubContentCount = environment.resources.filter((resource) => resource.service === "hub").length;
  const healthScore = getHealthScore(environment.summary);
  const { profile: capabilityProfile, extraCapabilities } = parseCapabilityProfile(environment.capabilities);
  const capabilitySummary = describeCapabilityProfile(capabilityProfile);
  const endpointLinks = [
    { label: "Open platform URL", href: environment.platform_url },
    { label: "Open gateway URL", href: environment.gateway_url },
    { label: "Open controller URL", href: environment.controller_url },
    { label: "Open EDA URL", href: environment.eda_url },
    { label: "Open automation hub URL", href: environment.hub_url },
  ].filter((item): item is { label: string; href: string } => Boolean(item.href));
  const footprintMetrics = [
    {
      label: "Tracked resources",
      value: environment.resources.length,
      valueText: "Resources currently stored for this environment",
      variant: "success" as const,
    },
    {
      label: "Templates",
      value: templateCount,
      valueText: "Job templates and workflow templates",
      variant: "success" as const,
    },
    {
      label: "Projects",
      value: projectCount,
      valueText: "Controller and EDA projects",
      variant: "success" as const,
    },
    {
      label: "EDA activations",
      value: activationCount,
      valueText: "Rulebook activations currently tracked",
      variant: "success" as const,
    },
    {
      label: "Hub content",
      value: hubContentCount,
      valueText: "Repositories and collections from automation hub",
      variant: "success" as const,
    },
  ];

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Environment detail"
          title={environment.name}
          description={
            environment.description || "Managed AAP environment with registered endpoints, monitoring posture, inventory, and settings."
          }
          actions={
            <>
              <StatusPill status={environment.status} />
              <Button type="button" variant="secondary" isLoading={syncing} isDisabled={syncing} onClick={handleSync}>
                {syncing ? "Queueing..." : "Queue sync"}
              </Button>
              <Button type="button" variant="danger" isDisabled={busy} onClick={handleDelete}>
                Delete environment
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
      {environment.last_sync_error ? (
        <StackItem>
          <Alert isInline variant="danger" title={`Last sync failed: ${environment.last_sync_error}`} />
        </StackItem>
      ) : null}

      <StackItem>
        <Gallery hasGutter minWidths={{ default: "180px", lg: "220px" }}>
          <StatCard label="Version" value={environment.platform_version ?? "Unknown"} detail="Most recent platform version reported" />
          <StatCard label="Health score" value={String(healthScore || "n/a")} detail="Calculated from collected service health" />
          <StatCard label="Tracked resources" value={String(environment.resources.length)} detail="Current inventory stored in the hub" />
          <StatCard label="Last sync" value={formatDateTime(environment.last_synced_at)} detail="Latest successful collection timestamp" />
          <StatCard label="Templates" value={templateCount} detail="Job templates and workflow templates" />
          <StatCard label="EDA activations" value={activationCount} detail="Rulebook activations currently tracked" />
        </Gallery>
      </StackItem>

      <StackItem>
        <Tabs activeKey={activeTabKey} onSelect={(_, key) => setActiveTabKey(key)} aria-label="Environment detail tabs">
          <Tab eventKey="overview" title="Overview">
            <Stack hasGutter className="aam-tab-panel">
              <StackItem>
                <Grid hasGutter>
                  <GridItem lg={6}>
                    <Card isFlat isFullHeight>
                      <CardHeader>
                        <Stack>
                          <StackItem>
                            <Title headingLevel="h2" size="lg">
                              Registered endpoints
                            </Title>
                          </StackItem>
                          <StackItem>
                            <Text component="p" className="aam-muted">
                              Remote services currently configured for collection and action relay.
                            </Text>
                          </StackItem>
                        </Stack>
                      </CardHeader>
                      <CardBody>
                        <Stack hasGutter>
                          <StackItem>
                            <DescriptionList isCompact isHorizontal columnModifier={{ default: "1Col" }}>
                              <DescriptionListGroup>
                                <DescriptionListTerm>Platform URL</DescriptionListTerm>
                                <DescriptionListDescription>{environment.platform_url || "Not set"}</DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup>
                                <DescriptionListTerm>Gateway URL</DescriptionListTerm>
                                <DescriptionListDescription>{environment.gateway_url}</DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup>
                                <DescriptionListTerm>Controller URL</DescriptionListTerm>
                                <DescriptionListDescription>{environment.controller_url || "Not configured"}</DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup>
                                <DescriptionListTerm>EDA URL</DescriptionListTerm>
                                <DescriptionListDescription>{environment.eda_url || "Not configured"}</DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup>
                                <DescriptionListTerm>Automation Hub URL</DescriptionListTerm>
                                <DescriptionListDescription>{environment.hub_url || "Not configured"}</DescriptionListDescription>
                              </DescriptionListGroup>
                            </DescriptionList>
                          </StackItem>
                          <StackItem>
                            <div className="aam-link-cluster">
                              {endpointLinks.map((item) => (
                                <Button key={item.label} component="a" href={item.href} target="_blank" rel="noreferrer" variant="secondary" size="sm">
                                  {item.label}
                                </Button>
                              ))}
                            </div>
                          </StackItem>
                        </Stack>
                      </CardBody>
                    </Card>
                  </GridItem>
                  <GridItem lg={6}>
                    <Card isFlat isFullHeight>
                      <CardHeader>
                        <Stack>
                          <StackItem>
                            <Title headingLevel="h2" size="lg">
                              Collection profile
                            </Title>
                          </StackItem>
                          <StackItem>
                            <Text component="p" className="aam-muted">
                              Settings that change how this environment is monitored and how operators are expected to access it.
                            </Text>
                          </StackItem>
                        </Stack>
                      </CardHeader>
                      <CardBody>
                        <div className="aam-summary-grid">
                          {getCollectionProfile(environment).map((item) => (
                            <div key={item.label} className="aam-summary-grid__item">
                              <Text component="small" className="aam-muted">
                                {item.label}
                              </Text>
                              <div>{item.value}</div>
                            </div>
                          ))}
                          <div className="aam-summary-grid__item">
                            <Text component="small" className="aam-muted">
                              Owner
                            </Text>
                            <div>{environment.owner || "Unassigned"}</div>
                          </div>
                          <div className="aam-summary-grid__item">
                            <Text component="small" className="aam-muted">
                              Tags and groups
                            </Text>
                            <div>{[...environment.tags, ...environment.groupings].join(", ") || "None set"}</div>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  </GridItem>
                </Grid>
              </StackItem>

              <StackItem>
                <Grid hasGutter>
                  <GridItem lg={6}>
                    <Card isFlat isFullHeight>
                      <CardHeader>
                        <Stack>
                          <StackItem>
                            <Title headingLevel="h2" size="lg">
                              Declared platform integrations
                            </Title>
                          </StackItem>
                          <StackItem>
                            <Text component="p" className="aam-muted">
                              Lifecycle, runtime, portal, and trust capabilities mapped from the broader Ansible platform ecosystem.
                            </Text>
                          </StackItem>
                        </Stack>
                      </CardHeader>
                      <CardBody>
                        <DescriptionList isCompact isHorizontal columnModifier={{ default: "1Col" }}>
                          {capabilitySummary.map((item) => (
                            <DescriptionListGroup key={item.label}>
                              <DescriptionListTerm>{item.label}</DescriptionListTerm>
                              <DescriptionListDescription>{item.value}</DescriptionListDescription>
                            </DescriptionListGroup>
                          ))}
                        </DescriptionList>
                      </CardBody>
                    </Card>
                  </GridItem>
                  <GridItem lg={6}>
                    <Card isFlat isFullHeight>
                      <CardHeader>
                        <Grid hasGutter style={{ width: "100%" }}>
                          <GridItem md={8}>
                            <Stack>
                              <StackItem>
                                <Title headingLevel="h2" size="lg">
                                  Recent activity
                                </Title>
                              </StackItem>
                              <StackItem>
                                <Text component="p" className="aam-muted">
                                  Sync runs and remote actions scoped to this environment.
                                </Text>
                              </StackItem>
                            </Stack>
                          </GridItem>
                          <GridItem md={4} style={{ textAlign: "right" }}>
                            <LinkButton to="/activity" variant="secondary">
                              View fleet activity
                            </LinkButton>
                          </GridItem>
                        </Grid>
                      </CardHeader>
                      <CardBody>
                        {activity.length === 0 ? (
                          <EmptyState
                            title="No activity yet"
                            description="Queue a sync or run an action against a collected resource to populate the stream."
                            action={
                              <Button type="button" variant="primary" onClick={handleSync}>
                                Queue sync
                              </Button>
                            }
                          />
                        ) : (
                          <ActivityTable items={activity.slice(0, 8)} showEnvironment={false} />
                        )}
                      </CardBody>
                    </Card>
                  </GridItem>
                </Grid>
              </StackItem>

              {Object.keys(extraCapabilities).length > 0 ? (
                <StackItem>
                  <Card isFlat>
                    <CardHeader>
                      <Stack>
                        <StackItem>
                          <Title headingLevel="h2" size="lg">
                            Additional capability flags
                          </Title>
                        </StackItem>
                        <StackItem>
                          <Text component="p" className="aam-muted">
                            Any extra capability settings that do not yet map to the structured profile.
                          </Text>
                        </StackItem>
                      </Stack>
                    </CardHeader>
                    <CardBody>
                      <CodeBlock className="aam-code-block">
                        <CodeBlockCode>{JSON.stringify(extraCapabilities, null, 2)}</CodeBlockCode>
                      </CodeBlock>
                    </CardBody>
                  </Card>
                </StackItem>
              ) : null}
            </Stack>
          </Tab>

          <Tab eventKey="monitoring" title="Monitoring">
            <Stack hasGutter className="aam-tab-panel">
              <StackItem>
                <Grid hasGutter>
                  <GridItem lg={6}>
                    <Card isFlat isFullHeight>
                      <CardHeader>
                        <Stack>
                          <StackItem>
                            <Title headingLevel="h2" size="lg">
                              Service readiness
                            </Title>
                          </StackItem>
                          <StackItem>
                            <Text component="p" className="aam-muted">
                              Core platform services and their latest collected health states.
                            </Text>
                          </StackItem>
                        </Stack>
                      </CardHeader>
                      <CardBody>
                        <div className="aam-summary-grid">
                          {monitoredServices.map((service) => (
                            <div key={`${environment.id}-${service}`} className="aam-summary-grid__item">
                              <Text component="small" className="aam-muted">
                                {service.toUpperCase()}
                              </Text>
                              <div>
                                <StatusPill status={getSnapshotHealth(environment.snapshots, service)} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardBody>
                    </Card>
                  </GridItem>
                  <GridItem lg={6}>
                    <Card isFlat isFullHeight>
                      <CardHeader>
                        <Stack>
                          <StackItem>
                            <Title headingLevel="h2" size="lg">
                              Observed footprint
                            </Title>
                          </StackItem>
                          <StackItem>
                            <Text component="p" className="aam-muted">
                              Visual summary of the inventory and automation resources currently tracked for this environment.
                            </Text>
                          </StackItem>
                        </Stack>
                      </CardHeader>
                      <CardBody>
                        <MetricBarChart items={footprintMetrics} emptyText="No footprint metrics available yet." />
                      </CardBody>
                    </Card>
                  </GridItem>
                </Grid>
              </StackItem>

              <StackItem>
                <Card isFlat>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          Common monitoring points
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Text component="p" className="aam-muted">
                          A single view of the common gateway, controller, EDA, and automation hub signals collected for this environment.
                        </Text>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    <Stack hasGutter>
                      {monitoringPointGroups.map((group) => (
                        <StackItem key={`${environment.id}-${group.id}`}>
                          <Card isFlat isCompact>
                            <CardHeader>
                              <Stack>
                                <StackItem>
                                  <Title headingLevel="h3" size="md">
                                    {group.title}
                                  </Title>
                                </StackItem>
                                <StackItem>
                                  <Text component="small" className="aam-muted">
                                    {group.description}
                                  </Text>
                                </StackItem>
                              </Stack>
                            </CardHeader>
                            <CardBody>
                              <div className="aam-summary-grid">
                                {group.points.map((point) => (
                                  <div key={`${environment.id}-${group.id}-${point.key}`} className="aam-summary-grid__item">
                                    <Text component="small" className="aam-muted">
                                      {point.label}
                                    </Text>
                                    {point.key === "health" ? (
                                      <div>
                                        <StatusPill status={String(getMonitoringValue(environment.snapshots, point))} />
                                      </div>
                                    ) : (
                                      <div>{formatMonitoringValue(point, getMonitoringValue(environment.snapshots, point))}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </CardBody>
                          </Card>
                        </StackItem>
                      ))}
                    </Stack>
                  </CardBody>
                </Card>
              </StackItem>

              <StackItem>
                <Card isFlat>
                  <CardHeader>
                    <Grid hasGutter style={{ width: "100%" }}>
                      <GridItem md={8}>
                        <Stack>
                          <StackItem>
                            <Title headingLevel="h2" size="lg">
                              Service posture details
                            </Title>
                          </StackItem>
                          <StackItem>
                            <Text component="p" className="aam-muted">
                              Raw summaries for each registered AAP component.
                            </Text>
                          </StackItem>
                        </Stack>
                      </GridItem>
                      <GridItem md={4} style={{ textAlign: "right" }}>
                        <LinkButton to="/topology" variant="secondary">
                          View topology
                        </LinkButton>
                      </GridItem>
                    </Grid>
                  </CardHeader>
                  <CardBody>
                    {environment.snapshots.length === 0 ? (
                      <EmptyState
                        title="No service data collected yet"
                        description="After the first sync, health, counts, and component-specific posture details will appear here."
                      />
                    ) : (
                      <Gallery hasGutter minWidths={{ default: "280px" }}>
                        {environment.snapshots.map((snapshot) => (
                          <Card key={snapshot.service} isFlat isCompact>
                            <CardHeader>
                              <Grid hasGutter style={{ width: "100%" }}>
                                <GridItem md={8}>
                                  <Title headingLevel="h3" size="md">
                                    {snapshot.service.toUpperCase()}
                                  </Title>
                                </GridItem>
                                <GridItem md={4} style={{ textAlign: "right" }}>
                                  <StatusPill status={snapshot.health} />
                                </GridItem>
                              </Grid>
                            </CardHeader>
                            <CardBody>
                              <DescriptionList isCompact columnModifier={{ default: "1Col" }}>
                                {Object.entries(snapshot.summary).map(([key, value]) => (
                                  <DescriptionListGroup key={key}>
                                    <DescriptionListTerm>{humanize(key)}</DescriptionListTerm>
                                    <DescriptionListDescription>{stringifyValue(value)}</DescriptionListDescription>
                                  </DescriptionListGroup>
                                ))}
                              </DescriptionList>
                            </CardBody>
                          </Card>
                        ))}
                      </Gallery>
                    )}
                  </CardBody>
                </Card>
              </StackItem>
            </Stack>
          </Tab>

          <Tab eventKey="inventory" title="Inventory">
            <Stack hasGutter className="aam-tab-panel">
              <StackItem>
                <Card isFlat>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          Tracked inventory
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Text component="p" className="aam-muted">
                          Controller, EDA, and automation hub resources with the direct actions that map to upstream AAP workflows.
                        </Text>
                      </StackItem>
                    </Stack>
                  </CardHeader>

                  <CardBody>
                    {environment.resources.length === 0 ? (
                      <EmptyState
                        title="No inventory collected yet"
                        description="Queue a sync after the endpoints and credentials are valid to populate managed resources."
                      />
                    ) : (
                      <Stack hasGutter>
                        <StackItem>
                          <Grid hasGutter>
                            <GridItem lg={6}>
                              <SearchInput
                                value={query}
                                onChange={(_, value) => setQuery(value)}
                                onClear={() => setQuery("")}
                                aria-label="Filter resources"
                                placeholder="Filter resources by name, ID, type, service, or namespace"
                              />
                            </GridItem>
                            <GridItem lg={3}>
                              <FormSelect value={serviceFilter} onChange={(_, value) => setServiceFilter(value)} aria-label="Filter by service">
                                <FormSelectOption value="all" label="All services" />
                                {services.map((service) => (
                                  <FormSelectOption key={service} value={service} label={service} />
                                ))}
                              </FormSelect>
                            </GridItem>
                            <GridItem lg={3}>
                              <FormSelect value={typeFilter} onChange={(_, value) => setTypeFilter(value)} aria-label="Filter by resource type">
                                <FormSelectOption value="all" label="All resource types" />
                                {resourceTypes.map((resourceType) => (
                                  <FormSelectOption key={resourceType} value={resourceType} label={humanize(resourceType)} />
                                ))}
                              </FormSelect>
                            </GridItem>
                          </Grid>
                        </StackItem>

                        {filteredResources.length === 0 ? (
                          <StackItem>
                            <EmptyState
                              title="No resources match the current filters"
                              description="Broaden the search, choose a different service, or queue a fresh sync."
                            />
                          </StackItem>
                        ) : (
                          filteredResources.map((resource) => {
                            const action = buildResourceAction(resource);
                            const busyAction = action ? `${resource.id}:${action.action}` === actioningId : false;

                            return (
                              <StackItem key={resource.id}>
                                <Card isFlat isCompact>
                                  <CardBody>
                                    <Grid hasGutter>
                                      <GridItem lg={4}>
                                        <Title headingLevel="h3" size="md">
                                          {resource.name}
                                        </Title>
                                        <Text component="small" className="aam-muted">
                                          {[resource.namespace, resource.external_id].filter(Boolean).join(" · ")}
                                        </Text>
                                      </GridItem>
                                      <GridItem lg={2}>
                                        <Text component="small" className="aam-muted">
                                          Service
                                        </Text>
                                        <div>{resource.service}</div>
                                      </GridItem>
                                      <GridItem lg={2}>
                                        <Text component="small" className="aam-muted">
                                          Type
                                        </Text>
                                        <div>{humanize(resource.resource_type)}</div>
                                      </GridItem>
                                      <GridItem lg={2}>
                                        <Text component="small" className="aam-muted">
                                          Status
                                        </Text>
                                        <div>
                                          <StatusPill status={resource.status} />
                                        </div>
                                      </GridItem>
                                      <GridItem lg={2}>
                                        <Text component="small" className="aam-muted">
                                          Last seen
                                        </Text>
                                        <div>{formatDateTime(resource.last_seen_at)}</div>
                                      </GridItem>
                                      <GridItem span={12}>
                                        {action ? (
                                          <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            isLoading={busyAction}
                                            isDisabled={busyAction}
                                            onClick={() => handleResourceAction(resource, action)}
                                          >
                                            {busyAction ? "Working..." : action.label}
                                          </Button>
                                        ) : (
                                          <Text component="small" className="aam-muted">
                                            No direct action for this resource type.
                                          </Text>
                                        )}
                                      </GridItem>
                                    </Grid>
                                  </CardBody>
                                </Card>
                              </StackItem>
                            );
                          })
                        )}
                      </Stack>
                    )}
                  </CardBody>
                </Card>
              </StackItem>
            </Stack>
          </Tab>

          <Tab eventKey="settings" title="Settings">
            <Stack hasGutter className="aam-tab-panel">
              <StackItem>
                <EnvironmentForm
                  mode="edit"
                  initialValue={environment}
                  title="Connection and registration settings"
                  description="Update endpoint locations, authentication, labels, advanced service behavior, and platform declarations for this managed environment."
                  submitLabel="Save changes"
                  busy={busy}
                  errorMessage={error}
                  onSubmit={handleSave}
                  showAdvancedSettings
                />
              </StackItem>
            </Stack>
          </Tab>
        </Tabs>
      </StackItem>
    </Stack>
  );
}
