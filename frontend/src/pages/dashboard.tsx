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
  Content,
  Title,
} from "@patternfly/react-core";

import { api } from "../api";
import { ActivityTable } from "../components/activity-table";
import { activityByDay, averageScoreByDay, ColumnChart, DonutChart } from "../components/charts";
import { EmptyState } from "../components/empty-state";
import { LinkButton } from "../components/link-button";
import { MetricBarChart } from "../components/metric-bar-chart";
import { PageHeader } from "../components/page-header";
import { StatCard } from "../components/stat-card";
import { orderedServiceEntries, resourceTypeLabel, serviceLabel } from "../monitoring";
import type { ActivityEvent, DashboardResponse, EnvironmentSummary, HealthSample } from "../types";
import { environmentKind, environmentKindLabel, humanize } from "../utils";

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

function getCoverageVariant(resourceType: string): "danger" | "warning" | undefined {
  const normalized = resourceType.toLowerCase().replace(/[_-]+/g, " ");
  if (normalized.includes("failed") || normalized.includes("error") || normalized.includes("critical")) {
    return "danger";
  }
  if (normalized.includes("disabled") || normalized.includes("warning")) {
    return "warning";
  }
  return undefined;
}

function sumServiceMetric(environments: EnvironmentSummary[], service: string, key: string): number {
  return environments.reduce((total, environment) => {
    const summaries = environment.summary.service_summaries;
    if (!summaries || typeof summaries !== "object" || Array.isArray(summaries)) {
      return total;
    }
    const snapshot = (summaries as Record<string, Record<string, unknown>>)[service];
    const value = snapshot?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return total + value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? total + parsed : total;
    }
    return total;
  }, 0);
}

function coverageEntries(breakdown: Record<string, number>): Array<[string, number]> {
  const preferred = new Set(["workflow", "execution", "integration"]);
  const ranked = Object.entries(breakdown).sort((left, right) => right[1] - left[1]);
  const top = ranked.slice(0, 8);
  for (const [resourceType, count] of ranked) {
    if (preferred.has(resourceType) && !top.some(([item]) => item === resourceType)) {
      top.push([resourceType, count]);
    }
  }
  return top;
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [healthHistory, setHealthHistory] = useState<HealthSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    Promise.allSettled([
      api.dashboard(controller.signal),
      api.activity(undefined, controller.signal),
      api.healthHistory(controller.signal),
    ])
      .then(([dashboardResult, activityResult, historyResult]) => {
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
        if (historyResult.status === "fulfilled") {
          setHealthHistory(historyResult.value);
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
        <Card >
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
        <Card >
          <CardBody>Loading dashboard...</CardBody>
        </Card>
      </Bullseye>
    );
  }

  const hasEnvironments = data.environment_count > 0;
  const aapEnvironments = data.environment_summaries.filter((environment) => environmentKind(environment) === "aap");
  const orchestratorEnvironments = data.environment_summaries.filter((environment) => environmentKind(environment) === "orchestrator");
  const topResources = coverageEntries(data.resource_breakdown);
  const orchestratorWorkflows = sumServiceMetric(orchestratorEnvironments, "orchestrator", "workflow_count");
  const orchestratorExecutions = sumServiceMetric(orchestratorEnvironments, "orchestrator", "execution_count");
  const orchestratorIntegrations = sumServiceMetric(orchestratorEnvironments, "orchestrator", "integration_count");
  const aapServices = Object.fromEntries(Object.entries(data.services).filter(([service]) => service !== "orchestrator"));
  const orchestratorServices = Object.fromEntries(Object.entries(data.services).filter(([service]) => service === "orchestrator"));
  const topIntegrations = Object.entries(data.integration_breakdown)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);
  function healthScoreItems(environments: EnvironmentSummary[]) {
    return environments.map((environment) => {
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
  }

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Overview"
          title="Multi-environment automation operations"
          description="Use the overview for high-level fleet status across Ansible Automation Platform and Automation Orchestrator estates, then move into monitoring, environment settings, and activity for operational work."
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
          <StatCard label="Managed environments" value={data.environment_count} detail="Registered AAP and Orchestrator estates" />
          <StatCard label="AAP environments" value={aapEnvironments.length} detail="Ansible Automation Platform estates" />
          <StatCard label="Orchestrator environments" value={orchestratorEnvironments.length} detail="Automation Orchestrator estates" />
          <StatCard label="Healthy" value={data.healthy_count} detail="No current collection or policy issues" />
          <StatCard label="Warning" value={data.warning_count} detail="Needs review or follow-up" />
          <StatCard label="Critical" value={data.critical_count} detail="Sync or service failures detected" />
        </Gallery>
      </StackItem>

      {!hasEnvironments ? (
        <StackItem>
          <Card >
            <CardBody>
              <EmptyState
                title="No environments registered"
                description="Register Ansible Automation Platform and Automation Orchestrator as separate environments to populate dashboard health, monitoring posture, topology, and governance data."
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
              <GridItem md={5} lg={4}>
                <Card isFullHeight>
                  <CardHeader>
                    <Title headingLevel="h2" size="lg">
                      Fleet health
                    </Title>
                  </CardHeader>
                  <CardBody>
                    <DonutChart
                      caption="Estates"
                      slices={[
                        { label: "Healthy", value: data.healthy_count, color: "var(--pf-t--global--color--status--success--default)" },
                        { label: "Warning", value: data.warning_count, color: "var(--pf-t--global--color--status--warning--default)" },
                        { label: "Critical", value: data.critical_count, color: "var(--pf-t--global--color--status--danger--default)" },
                      ]}
                    />
                  </CardBody>
                </Card>
              </GridItem>
              <GridItem md={7} lg={8}>
                <Stack hasGutter>
                  <StackItem>
                    <Card>
                      <CardHeader>
                        <Title headingLevel="h2" size="lg">
                          Health this week
                        </Title>
                      </CardHeader>
                      <CardBody>
                        <ColumnChart
                          items={averageScoreByDay(healthHistory)}
                          emptyText="Sync an environment to start a health trend."
                          label="Average health score by day"
                        />
                      </CardBody>
                    </Card>
                  </StackItem>
                  <StackItem>
                    <Card>
                      <CardHeader>
                        <Title headingLevel="h2" size="lg">
                          Activity this week
                        </Title>
                      </CardHeader>
                      <CardBody>
                        <ColumnChart items={activityByDay(activity.map((event) => event.created_at))} />
                      </CardBody>
                    </Card>
                  </StackItem>
                </Stack>
              </GridItem>
            </Grid>
          </StackItem>
          <StackItem>
            <Grid hasGutter>
              <GridItem lg={6}>
                <Card  isFullHeight>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          Compliance rollup
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Content component="p" className="aam-muted">
                          Most recent policy outcomes across the fleet.
                        </Content>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    {Object.keys(data.compliance).length === 0 ? (
                      <EmptyState
                        title="No policy results yet"
                        description="Create a governance policy and push it to the fleet to see compliant and noncompliant counts here."
                      />
                    ) : (
                      <Stack hasGutter>
                        {Object.entries(data.compliance).map(([key, value]) => {
                          const total = Object.values(data.compliance).reduce((sum, count) => sum + count, 0) || 1;
                          return (
                            <StackItem key={key}>
                              <Progress
                                title={humanize(key)}
                                value={(value / total) * 100}
                                measureLocation="outside"
                                label={String(value)}
                                valueText={`${value} of ${total} policy results`}
                                variant={getProgressVariant(key)}
                              />
                            </StackItem>
                          );
                        })}
                      </Stack>
                    )}
                  </CardBody>
                </Card>
              </GridItem>
              <GridItem lg={6}>
                <Card  isFullHeight>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          Service health
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Content component="p" className="aam-muted">
                          Component readiness by service type. Ansible Automation Platform and Automation Orchestrator are listed separately because they are different products.
                        </Content>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    <Stack hasGutter>
                      {orderedServiceEntries(aapServices).map(([service, counts]) => (
                        <StackItem key={service}>
                          <Title headingLevel="h3" size="md">
                            {serviceLabel(service)}
                          </Title>
                          <MetricBarChart
                            items={Object.entries(counts).map(([status, value]) => ({
                              label: humanize(status),
                              value,
                              total: Object.values(counts).reduce((total, count) => total + count, 0) || 1,
                              valueText: `${value} AAP environments`,
                              variant: getProgressVariant(status),
                            }))}
                          />
                        </StackItem>
                      ))}
                      {orchestratorEnvironments.length > 0 || orderedServiceEntries(orchestratorServices).length > 0 ? (
                        <>
                          <StackItem>
                            <Title headingLevel="h3" size="md">
                              {environmentKindLabel("orchestrator")}
                            </Title>
                            <Content component="p" className="aam-muted">
                              {orchestratorEnvironments.length} Orchestrator estate{orchestratorEnvironments.length === 1 ? "" : "s"} · {orchestratorWorkflows} workflows · {orchestratorExecutions} executions · {orchestratorIntegrations} integrations
                            </Content>
                          </StackItem>
                          {orderedServiceEntries(orchestratorServices).map(([service, counts]) => (
                            <StackItem key={service}>
                              <MetricBarChart
                                items={Object.entries(counts).map(([status, value]) => ({
                                  label: humanize(status),
                                  value,
                                  total: Object.values(counts).reduce((total, count) => total + count, 0) || 1,
                                  valueText: `${value} Orchestrator environments`,
                                  variant: getProgressVariant(status),
                                }))}
                              />
                            </StackItem>
                          ))}
                        </>
                      ) : null}
                    </Stack>
                  </CardBody>
                </Card>
              </GridItem>
            </Grid>
          </StackItem>

          <StackItem>
            <Grid hasGutter>
              <GridItem lg={6}>
                <Card  isFullHeight>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          AAP health scores
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Content component="p" className="aam-muted">
                          Ansible Automation Platform estates. Open monitoring for gateway, controller, EDA, and Hub signals.
                        </Content>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    <MetricBarChart items={healthScoreItems(aapEnvironments)} emptyText="No AAP environments registered." />
                  </CardBody>
                </Card>
              </GridItem>
              <GridItem lg={6}>
                <Card  isFullHeight>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          Orchestrator health scores
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Content component="p" className="aam-muted">
                          Automation Orchestrator estates. These are separate products from AAP, with their own health, workflows, and integrations.
                        </Content>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    <MetricBarChart items={healthScoreItems(orchestratorEnvironments)} emptyText="No Automation Orchestrator environments registered." />
                  </CardBody>
                </Card>
              </GridItem>
              <GridItem lg={6}>
                <Card  isFullHeight>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          Collection and interface declarations
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Content component="p" className="aam-muted">
                          Declared platform interfaces and integration patterns. These are counts, not health.
                        </Content>
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
                <Card  isFullHeight>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          Automation estate coverage
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Content component="p" className="aam-muted">
                          Inventory counts from the latest sync, not health. Failed jobs and similar types are highlighted.
                        </Content>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    {topResources.length === 0 ? (
                      <EmptyState
                        title="No inventory collected"
                        description="Queue a sync to populate templates, Orchestrator workflows, activations, repositories, and other tracked resources."
                      />
                    ) : (
                      <MetricBarChart
                        items={topResources.map(([resourceType, count]) => ({
                          label: resourceTypeLabel(resourceType),
                          value: count,
                          valueText: `${count} discovered resources`,
                          variant: getCoverageVariant(resourceType),
                        }))}
                      />
                    )}
                  </CardBody>
                </Card>
              </GridItem>
              <GridItem lg={6}>
                <Card  isFullHeight>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          Recent activity
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Content component="p" className="aam-muted">
                          Syncs, remote actions, and Automation Orchestrator workflow executions.
                        </Content>
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
