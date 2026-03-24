import { useEffect, useState } from "react";

import {
  Alert,
  Bullseye,
  Card,
  CardBody,
  CardHeader,
  Gallery,
  Grid,
  GridItem,
  Progress,
  Stack,
  StackItem,
  Text,
  Title,
} from "@patternfly/react-core";

import { api } from "../api";
import { ActivityTable } from "../components/activity-table";
import { EmptyState } from "../components/empty-state";
import { LinkButton } from "../components/link-button";
import { MetricBarChart } from "../components/metric-bar-chart";
import { PageHeader } from "../components/page-header";
import { StatCard } from "../components/stat-card";
import type { ActivityEvent, DashboardResponse } from "../types";
import { humanize } from "../utils";

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
    .slice(0, 8);
  const topIntegrations = Object.entries(data.integration_breakdown)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);
  const healthScores = data.environment_summaries.map((environment) => {
    const score =
      typeof environment.summary.health_score === "number"
        ? environment.summary.health_score
        : Number.parseInt(String(environment.summary.health_score ?? 0), 10) || 0;

    return {
      label: environment.name,
      value: score,
      total: 100,
      valueText: `${score} of 100`,
      variant: score >= 85 ? ("success" as const) : score >= 60 ? ("warning" as const) : ("danger" as const),
    };
  });

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Overview"
          title="Multi-environment automation operations"
          description="Use the overview for high-level fleet status, then move into monitoring, environment settings, and activity for operational work."
          actions={
            <>
              <LinkButton to="/monitoring" variant="secondary">
                View monitoring
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
                description="Register your first controller, gateway, EDA, or automation hub endpoint to populate dashboard health, monitoring posture, topology, and governance data."
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
                          Component readiness by service type. Open the monitoring view for the full cross-environment breakdown.
                        </Text>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    <Stack hasGutter>
                      {Object.entries(data.services).map(([service, counts]) => (
                        <StackItem key={service}>
                          <Title headingLevel="h3" size="md">
                            {service.toUpperCase()}
                          </Title>
                          <MetricBarChart
                            items={Object.entries(counts).map(([status, value]) => ({
                              label: humanize(status),
                              value,
                              total: Object.values(counts).reduce((total, count) => total + count, 0) || 1,
                              valueText: `${value} environments`,
                              variant: getProgressVariant(status),
                            }))}
                          />
                        </StackItem>
                      ))}
                    </Stack>
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
                          Environment health scores
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Text component="p" className="aam-muted">
                          Use this as a quick view of which environments need deeper investigation in the monitoring page.
                        </Text>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    <MetricBarChart items={healthScores} emptyText="No environment health scores available." />
                  </CardBody>
                </Card>
              </GridItem>
              <GridItem lg={6}>
                <Card isFlat isFullHeight>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          Collection and interface declarations
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Text component="p" className="aam-muted">
                          Declared platform interfaces and integration patterns across the fleet.
                        </Text>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    {topIntegrations.length === 0 ? (
                      <EmptyState
                        title="No platform interfaces declared"
                        description="Use the environment settings view to declare operators, Terraform, runner, receptor, portal, and trust integrations."
                      />
                    ) : (
                      <MetricBarChart
                        items={topIntegrations.map(([integration, count]) => ({
                          label: humanize(integration.replace("management:", "")),
                          value: count,
                          valueText: `${count} environments`,
                          variant: "success",
                        }))}
                      />
                    )}
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
                          Automation estate coverage
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Text component="p" className="aam-muted">
                          Resource types discovered from controller, EDA, and automation hub integrations.
                        </Text>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    {topResources.length === 0 ? (
                      <EmptyState
                        title="No inventory collected"
                        description="Queue a sync to populate templates, projects, activations, repositories, and other tracked resources."
                      />
                    ) : (
                      <MetricBarChart
                        items={topResources.map(([resourceType, count]) => ({
                          label: humanize(resourceType),
                          value: count,
                          valueText: `${count} discovered resources`,
                          variant: "success",
                        }))}
                      />
                    )}
                  </CardBody>
                </Card>
              </GridItem>
              <GridItem lg={6}>
                <Card isFlat isFullHeight>
                  <CardHeader>
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
              </GridItem>
            </Grid>
          </StackItem>
        </>
      )}
    </Stack>
  );
}
