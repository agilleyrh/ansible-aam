import { useEffect, useState } from "react";

import {
  Alert,
  Bullseye,
  Card,
  CardBody,
  CardHeader,
  Flex,
  Gallery,
  Grid,
  GridItem,
  Progress,
  Stack,
  StackItem,
  Text,
  Title,
} from "@patternfly/react-core";
import { Link } from "react-router-dom";

import { api } from "../api";
import { ActivityTable } from "../components/activity-table";
import { EmptyState } from "../components/empty-state";
import { LinkButton } from "../components/link-button";
import { PageHeader } from "../components/page-header";
import { StatCard } from "../components/stat-card";
import { StatusPill } from "../components/status-pill";
import type { ActivityEvent, DashboardResponse } from "../types";
import { formatDateTime, humanize } from "../utils";

function getProgressVariant(name: string): "danger" | "success" | "warning" | undefined {
  const normalized = name.toLowerCase();
  if (["compliant", "healthy", "success"].includes(normalized)) {
    return "success";
  }
  if (["warning", "queued", "running"].includes(normalized)) {
    return "warning";
  }
  if (["critical", "failed", "non_compliant", "error"].includes(normalized)) {
    return "danger";
  }
  return undefined;
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    Promise.allSettled([api.dashboard(controller.signal), api.activity(undefined, controller.signal)])
      .then(([dashboardResult, activityResult]) => {
        if (controller.signal.aborted) {
          return;
        }
        if (dashboardResult.status === "fulfilled") {
          setData(dashboardResult.value);
          setError(null);
        } else {
          setError(dashboardResult.reason?.message ?? "Failed to load dashboard");
        }
        if (activityResult.status === "fulfilled") {
          setActivity(activityResult.value);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  if (loading && !data) {
    return (
      <Bullseye>
        <Card isFlat>
          <CardBody>Loading dashboard...</CardBody>
        </Card>
      </Bullseye>
    );
  }

  if (error && !data) {
    return <Alert isInline variant="danger" title={`Dashboard unavailable: ${error}`} />;
  }

  if (!data) {
    return (
      <Bullseye>
        <Card isFlat>
          <CardBody>Loading dashboard...</CardBody>
        </Card>
      </Bullseye>
    );
  }

  const hasEnvironments = data.environment_count > 0;
  const topResources = Object.entries(data.resource_breakdown)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);
  const topIntegrations = Object.entries(data.integration_breakdown)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Overview"
          title="Multi-environment automation operations"
          description="Track health, compliance, and component posture across every registered AAP environment from one console."
          actions={
            <>
              <LinkButton to="/settings" variant="secondary">
                View runtime settings
              </LinkButton>
              <LinkButton to="/environments" variant="primary">
                Open environment registry
              </LinkButton>
            </>
          }
        />
      </StackItem>

      {error ? (
        <StackItem>
          <Alert isInline variant="warning" title={`Loaded with partial data: ${error}`} />
        </StackItem>
      ) : null}

      <StackItem>
        <Gallery hasGutter minWidths={{ default: "180px", lg: "220px" }}>
          <StatCard label="Managed environments" value={data.environment_count} detail="Registered AAP estates" />
          <StatCard label="Healthy" value={data.healthy_count} detail="No current collection or policy issues" />
          <StatCard label="Warning" value={data.warning_count} detail="Needs review or follow-up" />
          <StatCard label="Critical" value={data.critical_count} detail="Sync or service failures detected" />
        </Gallery>
      </StackItem>

      {!hasEnvironments ? (
        <StackItem>
          <Card isFlat>
            <CardBody>
              <EmptyState
                title="No AAP environments registered"
                description="Register your first controller, gateway, EDA, or automation hub endpoint to populate dashboard health, topology, and governance data."
                action={
                  <LinkButton to="/environments" variant="primary">
                    Register first environment
                  </LinkButton>
                }
              />
            </CardBody>
          </Card>
        </StackItem>
      ) : (
        <>
          <StackItem>
            <Grid hasGutter>
              <GridItem lg={6}>
                <Card isFlat isFullHeight>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          Compliance rollup
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Text component="p" className="aam-muted">
                          Most recent policy outcomes across the fleet.
                        </Text>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    <Stack hasGutter>
                      {Object.entries(data.compliance).map(([key, value]) => (
                        <StackItem key={key}>
                          <Progress
                            title={humanize(key)}
                            value={Math.min(value * 18, 100)}
                            measureLocation="outside"
                            label={String(value)}
                            valueText={`${value} policy results`}
                            variant={getProgressVariant(key)}
                          />
                        </StackItem>
                      ))}
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
                          Service health
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Text component="p" className="aam-muted">
                          Component readiness by service type.
                        </Text>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    <Gallery hasGutter minWidths={{ default: "220px" }}>
                      {Object.entries(data.services).map(([service, counts]) => (
                        <Card key={service} isFlat isCompact>
                          <CardHeader>
                            <Title headingLevel="h3" size="md">
                              {service.toUpperCase()}
                            </Title>
                          </CardHeader>
                          <CardBody>
                            <Flex gap={{ default: "gapSm" }} flexWrap={{ default: "wrap" }}>
                              {Object.entries(counts).map(([status, value]) => (
                                <Flex key={status} gap={{ default: "gapXs" }} alignItems={{ default: "alignItemsCenter" }}>
                                  <StatusPill status={status} />
                                  <Text component="small">{value}</Text>
                                </Flex>
                              ))}
                            </Flex>
                          </CardBody>
                        </Card>
                      ))}
                    </Gallery>
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
                    <Flex
                      justifyContent={{ default: "justifyContentSpaceBetween" }}
                      alignItems={{ default: "alignItemsFlexStart" }}
                      flexWrap={{ default: "wrap" }}
                      gap={{ default: "gapSm" }}
                      style={{ width: "100%" }}
                    >
                      <Stack>
                        <StackItem>
                          <Title headingLevel="h2" size="lg">
                            Automation estate coverage
                          </Title>
                        </StackItem>
                        <StackItem>
                          <Text component="p" className="aam-muted">
                            Resource types discovered from controller, EDA, and automation hub integrations.
                          </Text>
                        </StackItem>
                      </Stack>
                      <LinkButton to="/search" variant="link" isInline>
                        Search inventory
                      </LinkButton>
                    </Flex>
                  </CardHeader>
                  <CardBody>
                    {topResources.length === 0 ? (
                      <EmptyState
                        title="No inventory collected"
                        description="Queue a sync to populate templates, projects, activations, repositories, and other tracked resources."
                      />
                    ) : (
                      <Stack hasGutter>
                        {topResources.map(([resourceType, count]) => (
                          <StackItem key={resourceType}>
                            <Progress
                              title={humanize(resourceType)}
                              value={Math.min(count * 10, 100)}
                              measureLocation="outside"
                              label={String(count)}
                              valueText={`${count} discovered resources`}
                              variant="success"
                            />
                          </StackItem>
                        ))}
                      </Stack>
                    )}
                  </CardBody>
                </Card>
              </GridItem>
              <GridItem lg={6}>
                <Card isFlat isFullHeight>
                  <CardHeader>
                    <Flex
                      justifyContent={{ default: "justifyContentSpaceBetween" }}
                      alignItems={{ default: "alignItemsFlexStart" }}
                      flexWrap={{ default: "wrap" }}
                      gap={{ default: "gapSm" }}
                      style={{ width: "100%" }}
                    >
                      <Stack>
                        <StackItem>
                          <Title headingLevel="h2" size="lg">
                            Platform interface adoption
                          </Title>
                        </StackItem>
                        <StackItem>
                          <Text component="p" className="aam-muted">
                            Provisioning, runtime, portal, and trust patterns derived from the broader Ansible platform repositories.
                          </Text>
                        </StackItem>
                      </Stack>
                      <LinkButton to="/environments" variant="link" isInline>
                        Edit environment interfaces
                      </LinkButton>
                    </Flex>
                  </CardHeader>
                  <CardBody>
                    {topIntegrations.length === 0 ? (
                      <EmptyState
                        title="No platform interfaces declared"
                        description="Use the structured registration fields to declare operators, Terraform, runner, receptor, portal, and trust integrations."
                      />
                    ) : (
                      <Stack hasGutter>
                        {topIntegrations.map(([integration, count]) => (
                          <StackItem key={integration}>
                            <Progress
                              title={humanize(integration.replace("management:", ""))}
                              value={Math.min(count * 20, 100)}
                              measureLocation="outside"
                              label={String(count)}
                              valueText={`${count} environments`}
                              variant="success"
                            />
                          </StackItem>
                        ))}
                      </Stack>
                    )}
                  </CardBody>
                </Card>
              </GridItem>
            </Grid>
          </StackItem>

          <StackItem>
            <Card isFlat>
              <CardHeader>
                <Flex
                  justifyContent={{ default: "justifyContentSpaceBetween" }}
                  alignItems={{ default: "alignItemsFlexStart" }}
                  flexWrap={{ default: "wrap" }}
                  gap={{ default: "gapSm" }}
                  style={{ width: "100%" }}
                >
                  <Stack>
                    <StackItem>
                      <Title headingLevel="h2" size="lg">
                        Recent activity
                      </Title>
                    </StackItem>
                    <StackItem>
                      <Text component="p" className="aam-muted">
                        Syncs and remote actions aligned to an AAP-style activity stream.
                      </Text>
                    </StackItem>
                  </Stack>
                  <LinkButton to="/activity" variant="link" isInline>
                    View activity stream
                  </LinkButton>
                </Flex>
              </CardHeader>
              <CardBody>
                {activity.length === 0 ? (
                  <EmptyState
                    title="No activity recorded"
                    description="Register an environment, queue a sync, or launch a managed action to populate the feed."
                  />
                ) : (
                  <ActivityTable items={activity.slice(0, 6)} />
                )}
              </CardBody>
            </Card>
          </StackItem>

          <StackItem>
            <Card isFlat>
              <CardHeader>
                <Stack>
                  <StackItem>
                    <Title headingLevel="h2" size="lg">
                      Environment registry
                    </Title>
                  </StackItem>
                  <StackItem>
                    <Text component="p" className="aam-muted">
                      Operational view of every registered automation footprint.
                    </Text>
                  </StackItem>
                </Stack>
              </CardHeader>
              <CardBody>
                <Stack hasGutter>
                  {data.environment_summaries.map((environment) => (
                    <Card key={environment.id} isFlat isCompact>
                      <CardBody>
                        <Grid hasGutter>
                          <GridItem md={4}>
                            <Link to={`/environments/${environment.id}`}>
                              <Title headingLevel="h3" size="md">
                                {environment.name}
                              </Title>
                            </Link>
                            <Text component="small" className="aam-muted">
                              {environment.groupings.join(", ") || environment.slug}
                            </Text>
                          </GridItem>
                          <GridItem md={2}>
                            <Text component="small" className="aam-muted">
                              Status
                            </Text>
                            <div>
                              <StatusPill status={environment.status} />
                            </div>
                          </GridItem>
                          <GridItem md={2}>
                            <Text component="small" className="aam-muted">
                              Version
                            </Text>
                            <div>{environment.platform_version ?? "Unknown"}</div>
                          </GridItem>
                          <GridItem md={2}>
                            <Text component="small" className="aam-muted">
                              Health score
                            </Text>
                            <div>{String(environment.summary.health_score ?? "n/a")}</div>
                          </GridItem>
                          <GridItem md={2}>
                            <Text component="small" className="aam-muted">
                              Last sync
                            </Text>
                            <div>{formatDateTime(environment.last_synced_at)}</div>
                          </GridItem>
                        </Grid>
                      </CardBody>
                    </Card>
                  ))}
                </Stack>
              </CardBody>
            </Card>
          </StackItem>
        </>
      )}
    </Stack>
  );
}
