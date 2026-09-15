import { useEffect, useState } from "react";

import {
  Alert,
  Bullseye,
  Card,
  CardBody,
  CardHeader,
  ExpandableSection,
  Grid,
  GridItem,
  Label,
  Stack,
  StackItem,
  Content,
  Title,
} from "@patternfly/react-core";

import { api } from "../api";
import { parseCapabilityProfile } from "../capabilities";
import { EmptyState } from "../components/empty-state";
import { LinkButton } from "../components/link-button";
import { MetricBarChart } from "../components/metric-bar-chart";
import { MonitoringFindings, MonitoringHealthyState } from "../components/monitoring-findings";
import { PageHeader } from "../components/page-header";
import { StatCard } from "../components/stat-card";
import { StatusPill } from "../components/status-pill";
import {
  formatMonitoringValue,
  getCollectionProfile,
  getHealthScore,
  getMonitoringValue,
  getSnapshotHealth,
  getSnapshot,
  collectEnvironmentFindings,
  collectMonitoringFindings,
  aapMonitoredServices,
  monitoredServicesFor,
  monitoringPointGroupsFor,
  orchestratorMonitoredServices,
  serviceLabel,
} from "../monitoring";
import type { MonitoringEnvironment, MonitoringResponse } from "../types";
import { environmentKind, environmentKindLabel, formatDateTime } from "../utils";

type HealthBreakdown = {
  service: string;
  counts: Record<string, number>;
  total: number;
};

function sumNumericMetric(environments: MonitoringEnvironment[], service: string, key: string): number {
  return environments.reduce((total, environment) => {
    const snapshot = getSnapshot(environment.snapshots, service);
    const value = snapshot?.summary[key];
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

function buildHealthBreakdown(environments: MonitoringEnvironment[], services: readonly string[]): HealthBreakdown[] {
  return services.map((service) => {
    const counts = { healthy: 0, warning: 0, critical: 0, not_configured: 0, unknown: 0 };

    environments.forEach((environment) => {
      const health = getSnapshotHealth(environment.snapshots, service);
      if (health in counts) {
        counts[health as keyof typeof counts] += 1;
      } else {
        counts.unknown += 1;
      }
    });

    return {
      service,
      counts,
      total: environments.length,
    };
  });
}

export function MonitoringPage() {
  const [data, setData] = useState<MonitoringResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.monitoring(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
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
  }, []);

  if (loading && !data) {
    return (
      <Bullseye>
        <Card >
          <CardBody>Loading monitoring posture...</CardBody>
        </Card>
      </Bullseye>
    );
  }

  if (error && !data) {
    return <Alert isInline variant="danger" title={`Monitoring unavailable: ${error}`} />;
  }

  if (!data) {
    return (
      <Bullseye>
        <Card >
          <CardBody>Loading monitoring posture...</CardBody>
        </Card>
      </Bullseye>
    );
  }

  const environments = data.environments;
  const aapEnvironments = environments.filter((environment) => environmentKind(environment) === "aap");
  const orchestratorEnvironments = environments.filter((environment) => environmentKind(environment) === "orchestrator");
  const findings = collectMonitoringFindings(environments);
  const failedJobCount = sumNumericMetric(aapEnvironments, "controller", "failed_jobs_recent");
  const failedProjectCount = sumNumericMetric(aapEnvironments, "controller", "failed_projects_recent");
  const disabledActivationCount = sumNumericMetric(aapEnvironments, "eda", "disabled_activations");
  const aapBreakdown = buildHealthBreakdown(aapEnvironments, aapMonitoredServices);
  const orchestratorBreakdown = buildHealthBreakdown(orchestratorEnvironments, orchestratorMonitoredServices);
  const controllerCount = aapEnvironments.filter((environment) => getSnapshotHealth(environment.snapshots, "controller") !== "not_configured").length;
  const edaCount = aapEnvironments.filter((environment) => getSnapshotHealth(environment.snapshots, "eda") !== "not_configured").length;
  const hubCount = aapEnvironments.filter((environment) => getSnapshotHealth(environment.snapshots, "hub") !== "not_configured").length;
  const orchestratorCount = orchestratorEnvironments.length;
  const activationCount = sumNumericMetric(aapEnvironments, "eda", "activation_count");
  const collectionCount = sumNumericMetric(aapEnvironments, "hub", "collection_count");
  const templateCount =
    sumNumericMetric(aapEnvironments, "controller", "job_template_count") +
    sumNumericMetric(aapEnvironments, "controller", "workflow_job_template_count");
  const configurationCoverage = [
    {
      label: "Controller monitoring",
      value: controllerCount,
      total: aapEnvironments.length || 1,
      valueText: `${controllerCount} of ${aapEnvironments.length} AAP environments`,
      variant: "success" as const,
    },
    {
      label: "EDA monitoring",
      value: edaCount,
      total: aapEnvironments.length || 1,
      valueText: `${edaCount} of ${aapEnvironments.length} AAP environments`,
      variant: "success" as const,
    },
    {
      label: "Automation Hub monitoring",
      value: hubCount,
      total: aapEnvironments.length || 1,
      valueText: `${hubCount} of ${aapEnvironments.length} AAP environments`,
      variant: "success" as const,
    },
    {
      label: "Orchestrator estates",
      value: orchestratorCount,
      total: environments.length || 1,
      valueText: `${orchestratorCount} of ${environments.length} environments`,
      variant: "success" as const,
    },
    {
      label: "Gateway-only access declared",
      value: aapEnvironments.filter((environment) => parseCapabilityProfile(environment.capabilities).profile.gateway_enforced).length,
      total: aapEnvironments.length || 1,
      valueText: "AAP environments expecting gateway-only access",
    },
    {
      label: "Metrics or reports declared",
      value: environments.filter((environment) => {
        const profile = parseCapabilityProfile(environment.capabilities).profile;
        return profile.metrics_enabled || profile.automation_reports_enabled;
      }).length,
      total: environments.length || 1,
      valueText: "Environments with observability declarations",
      variant: "success" as const,
    },
    {
      label: "Content signing declared",
      value: aapEnvironments.filter((environment) => parseCapabilityProfile(environment.capabilities).profile.content_signing_enabled).length,
      total: aapEnvironments.length || 1,
      valueText: "AAP environments with content signing declarations",
    },
  ];
  const operationalSignals = [
    {
      label: "Controller jobs",
      value: sumNumericMetric(aapEnvironments, "controller", "job_count"),
      valueText: "Jobs discovered across AAP controller estates",
      variant: "success" as const,
    },
    {
      label: "Tracked templates",
      value: templateCount,
      valueText: "Job and workflow templates discovered",
      variant: "success" as const,
    },
    {
      label: "Recent failed jobs",
      value: failedJobCount,
      valueText: "Failed jobs reported by recent controller queries",
      variant: failedJobCount > 0 ? ("danger" as const) : ("success" as const),
    },
    {
      label: "Failed projects",
      value: failedProjectCount,
      valueText: "Projects currently reporting a failed state",
      variant: failedProjectCount > 0 ? ("warning" as const) : ("success" as const),
    },
    {
      label: "EDA activations",
      value: activationCount,
      valueText: "Rulebook activations discovered across AAP environments",
      variant: "success" as const,
    },
    {
      label: "Disabled activations",
      value: disabledActivationCount,
      valueText: "Activations currently disabled",
      variant: disabledActivationCount > 0 ? ("warning" as const) : ("success" as const),
    },
    {
      label: "Hub collections",
      value: collectionCount,
      valueText: "Collections returned by automation hub APIs",
      variant: "success" as const,
    },
    {
      label: "Orchestrator workflows",
      value: sumNumericMetric(orchestratorEnvironments, "orchestrator", "workflow_count"),
      valueText: "Workflows discovered in Orchestrator estates",
      variant: "success" as const,
    },
    {
      label: "Orchestrator integrations",
      value: sumNumericMetric(orchestratorEnvironments, "orchestrator", "integration_count"),
      valueText: "Integrations configured in Orchestrator estates",
      variant: "success" as const,
    },
    {
      label: "Failed orchestrator executions",
      value: sumNumericMetric(orchestratorEnvironments, "orchestrator", "failed_executions_recent"),
      valueText: "Recent failed or errored Orchestrator executions",
      variant: sumNumericMetric(orchestratorEnvironments, "orchestrator", "failed_executions_recent") > 0 ? ("danger" as const) : ("success" as const),
    },
  ];

  const envSpan = environments.length === 1 ? 12 : 6;

  return (
    <Stack hasGutter className="aam-monitoring-page">
      <StackItem>
        <PageHeader
          section="Monitoring"
          title="Fleet monitoring and service posture"
          description="Review Ansible Automation Platform and Automation Orchestrator as separate estates. Warnings mean a service is reachable but incomplete or unhealthy; critical means collection failed."
          actions={
            <>
              <LinkButton to="/activity" variant="secondary">
                View activity stream
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
        <Grid hasGutter>
          <GridItem sm={6} xl={4}>
            <StatCard label="AAP environments" value={aapEnvironments.length} detail="Ansible Automation Platform estates" />
          </GridItem>
          <GridItem sm={6} xl={4}>
            <StatCard label="Orchestrator environments" value={orchestratorCount} detail="Automation Orchestrator estates" />
          </GridItem>
          <GridItem sm={6} xl={4}>
            <StatCard label="Controllers monitored" value={controllerCount} detail="Controller collection on AAP estates" />
          </GridItem>
          <GridItem sm={6} xl={4}>
            <StatCard label="EDA activations" value={activationCount} detail="Activations across AAP estates" />
          </GridItem>
          <GridItem sm={6} xl={4}>
            <StatCard label="Hub collections" value={collectionCount} detail="Collections from automation hub" />
          </GridItem>
          <GridItem sm={6} xl={4}>
            <StatCard
              label="Orchestrator workflows"
              value={sumNumericMetric(orchestratorEnvironments, "orchestrator", "workflow_count")}
              detail="Workflows from Orchestrator estates"
            />
          </GridItem>
        </Grid>
      </StackItem>

      {environments.length === 0 ? (
        <StackItem>
          <Card>
            <CardBody>
              <EmptyState
                title="No monitoring data yet"
                description="Register an environment and queue its first sync to populate fleet service posture, controller counts, EDA activations, and hub content."
                action={
                  <LinkButton to="/environments" variant="primary">
                    Register environment
                  </LinkButton>
                }
              />
            </CardBody>
          </Card>
        </StackItem>
      ) : (
        <>
          <StackItem>
            <Card>
              <CardHeader>
                <Stack>
                  <StackItem>
                    <Title headingLevel="h2" size="lg">
                      Needs attention
                    </Title>
                  </StackItem>
                  <StackItem>
                    <Content component="p" className="aam-muted">
                      These findings come from the latest sync. A warning means the service answered but looks incomplete or unhealthy. Critical means AAM could not collect that service.
                    </Content>
                  </StackItem>
                </Stack>
              </CardHeader>
              <CardBody>
                {findings.length > 0 ? <MonitoringFindings findings={findings} /> : <MonitoringHealthyState />}
              </CardBody>
            </Card>
          </StackItem>
          <StackItem>
            <Grid hasGutter>
              <GridItem md={6}>
                <Stack hasGutter>
                  <StackItem>
                    <Card>
                      <CardHeader>
                        <Stack>
                          <StackItem>
                            <Title headingLevel="h2" size="lg">
                              Fleet service readiness
                            </Title>
                          </StackItem>
                          <StackItem>
                            <Content component="p" className="aam-muted">
                              Counts of the latest health state per service. Use Needs attention above for the reason and the fix.
                            </Content>
                          </StackItem>
                        </Stack>
                      </CardHeader>
                      <CardBody>
                        <div className="aam-health-table">
                          {aapEnvironments.length > 0 ? (
                            <>
                              <div className="aam-health-table__row">
                                <strong>{environmentKindLabel("aap")}</strong>
                                <div className="aam-health-table__counts">
                                  <Label isCompact>{aapEnvironments.length} estates</Label>
                                </div>
                              </div>
                              {aapBreakdown.map((service) => (
                                <div key={service.service} className="aam-health-table__row">
                                  <strong>{serviceLabel(service.service)}</strong>
                                  <div className="aam-health-table__counts">
                                    <Label color="green" isCompact>
                                      {service.counts.healthy} healthy
                                    </Label>
                                    <Label color="orange" isCompact>
                                      {service.counts.warning} warning
                                    </Label>
                                    <Label color="red" isCompact>
                                      {service.counts.critical} critical
                                    </Label>
                                    <Label color="grey" isCompact>
                                      {service.counts.not_configured} skipped
                                    </Label>
                                  </div>
                                </div>
                              ))}
                            </>
                          ) : null}
                          {orchestratorEnvironments.length > 0 ? (
                            <>
                              <div className="aam-health-table__row">
                                <strong>{environmentKindLabel("orchestrator")}</strong>
                                <div className="aam-health-table__counts">
                                  <Label color="purple" isCompact>{orchestratorEnvironments.length} estates</Label>
                                </div>
                              </div>
                              {orchestratorBreakdown.map((service) => (
                                <div key={service.service} className="aam-health-table__row">
                                  <strong>{serviceLabel(service.service)}</strong>
                                  <div className="aam-health-table__counts">
                                    <Label color="green" isCompact>
                                      {service.counts.healthy} healthy
                                    </Label>
                                    <Label color="orange" isCompact>
                                      {service.counts.warning} warning
                                    </Label>
                                    <Label color="red" isCompact>
                                      {service.counts.critical} critical
                                    </Label>
                                    <Label color="grey" isCompact>
                                      {service.counts.not_configured} skipped
                                    </Label>
                                  </div>
                                </div>
                              ))}
                            </>
                          ) : null}
                        </div>
                      </CardBody>
                    </Card>
                  </StackItem>
                  <StackItem>
                    <Card>
                      <CardHeader>
                        <Stack>
                          <StackItem>
                            <Title headingLevel="h2" size="lg">
                              Environment health scores
                            </Title>
                          </StackItem>
                          <StackItem>
                            <Content component="p" className="aam-muted">
                              Average of collected services for each estate. AAP scores gateway, controller, EDA, and Hub. Orchestrator scores its own API. Healthy scores 100, warning 70, critical 35. Below 85 shows as warning.
                            </Content>
                          </StackItem>
                        </Stack>
                      </CardHeader>
                      <CardBody>
                        <MetricBarChart
                          items={environments.map((environment) => ({
                            label: environment.name,
                            value: getHealthScore(environment.summary),
                            total: 100,
                            valueText: `${getHealthScore(environment.summary)} of 100`,
                            variant:
                              getHealthScore(environment.summary) >= 85
                                ? "success"
                                : getHealthScore(environment.summary) >= 60
                                  ? "warning"
                                  : "danger",
                          }))}
                        />
                      </CardBody>
                    </Card>
                  </StackItem>
                </Stack>
              </GridItem>
              <GridItem md={6}>
                <Stack hasGutter>
                  <StackItem>
                    <Card>
                      <CardHeader>
                        <Title headingLevel="h2" size="lg">
                          Operational signals
                        </Title>
                      </CardHeader>
                      <CardBody>
                        <MetricBarChart items={operationalSignals} emptyText="No operational signals collected yet." />
                      </CardBody>
                    </Card>
                  </StackItem>
                  <StackItem>
                    <Card>
                      <CardHeader>
                        <Title headingLevel="h2" size="lg">
                          Collection coverage
                        </Title>
                      </CardHeader>
                      <CardBody>
                        <MetricBarChart items={configurationCoverage} emptyText="No configuration coverage data available." />
                      </CardBody>
                    </Card>
                  </StackItem>
                </Stack>
              </GridItem>
            </Grid>
          </StackItem>

          <StackItem>
            <Stack hasGutter>
              <StackItem>
                <Title headingLevel="h2" size="lg">
                  Environment monitoring profiles
                </Title>
              </StackItem>
              <StackItem>
                <Grid hasGutter>
                  {environments.map((environment) => (
                    <GridItem key={environment.id} md={envSpan}>
                      <Card className="aam-env-monitor-card" isCompact>
                        <CardHeader>
                          <Stack>
                            <StackItem>
                              <Title headingLevel="h3" size="md">
                                {environment.name}
                              </Title>
                            </StackItem>
                            <StackItem>
                              <Label color={environmentKind(environment) === "orchestrator" ? "purple" : "blue"} isCompact>
                                {environmentKindLabel(environment)}
                              </Label>
                            </StackItem>
                            <StackItem>
                              <Content component="small" className="aam-muted">
                                Last sync {formatDateTime(environment.last_synced_at)}
                              </Content>
                            </StackItem>
                          </Stack>
                        </CardHeader>
                        <CardBody>
                          <Stack hasGutter>
                            <StackItem>
                              <div className="aam-link-cluster">
                                <StatusPill status={environment.status} />
                                {monitoredServicesFor(environment).map((service) => (
                                  <Label key={`${environment.id}-${service}`} isCompact>
                                    {serviceLabel(service)}: {getSnapshotHealth(environment.snapshots, service)}
                                  </Label>
                                ))}
                              </div>
                            </StackItem>
                            <StackItem>
                              <MonitoringFindings findings={collectEnvironmentFindings(environment)} showEnvironment={false} />
                            </StackItem>
                            <StackItem>
                              <ExpandableSection toggleText="Collection details">
                                <Stack hasGutter>
                                  <StackItem>
                                    <div className="aam-summary-grid">
                                      {getCollectionProfile(environment).map((item) => (
                                        <div key={`${environment.id}-${item.label}`} className="aam-summary-grid__item">
                                          <Content component="small" className="aam-muted">
                                            {item.label}
                                          </Content>
                                          <div>{item.value}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </StackItem>
                                  {monitoringPointGroupsFor(environment).map((group) => (
                                    <StackItem key={`${environment.id}-${group.id}`}>
                                      <Content component="small" className="aam-muted">
                                        {group.title}
                                      </Content>
                                      <div className="aam-summary-grid">
                                        {group.points.map((point) => (
                                          <div key={`${environment.id}-${group.id}-${point.key}`} className="aam-summary-grid__item">
                                            <Content component="small" className="aam-muted">
                                              {point.label}
                                            </Content>
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
                                    </StackItem>
                                  ))}
                                </Stack>
                              </ExpandableSection>
                            </StackItem>
                            <StackItem>
                              <LinkButton to={`/environments/${environment.id}`} variant="secondary" size="sm">
                                Open environment
                              </LinkButton>
                            </StackItem>
                          </Stack>
                        </CardBody>
                      </Card>
                    </GridItem>
                  ))}
                </Grid>
              </StackItem>
            </Stack>
          </StackItem>
        </>
      )}
    </Stack>
  );
}
