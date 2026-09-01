import { useEffect, useState } from "react";

import {
  Alert,
  Bullseye,
  Card,
  CardBody,
  CardHeader,
  ExpandableSection,
  Gallery,
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
  monitoredServices,
  monitoringPointGroups,
} from "../monitoring";
import type { MonitoringEnvironment, MonitoringResponse } from "../types";
import { formatDateTime } from "../utils";

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

function buildHealthBreakdown(environments: MonitoringEnvironment[]): HealthBreakdown[] {
  return monitoredServices.map((service) => {
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
  const serviceBreakdown = buildHealthBreakdown(environments);
  const controllerCount = environments.filter((environment) => getSnapshotHealth(environment.snapshots, "controller") !== "not_configured").length;
  const edaCount = environments.filter((environment) => getSnapshotHealth(environment.snapshots, "eda") !== "not_configured").length;
  const hubCount = environments.filter((environment) => getSnapshotHealth(environment.snapshots, "hub") !== "not_configured").length;
  const activationCount = sumNumericMetric(environments, "eda", "activation_count");
  const collectionCount = sumNumericMetric(environments, "hub", "collection_count");
  const templateCount =
    sumNumericMetric(environments, "controller", "job_template_count") +
    sumNumericMetric(environments, "controller", "workflow_job_template_count");
  const configurationCoverage = [
    {
      label: "Controller monitoring",
      value: controllerCount,
      total: environments.length,
      valueText: `${controllerCount} of ${environments.length} environments`,
      variant: "success" as const,
    },
    {
      label: "EDA monitoring",
      value: edaCount,
      total: environments.length,
      valueText: `${edaCount} of ${environments.length} environments`,
      variant: "success" as const,
    },
    {
      label: "Automation Hub monitoring",
      value: hubCount,
      total: environments.length,
      valueText: `${hubCount} of ${environments.length} environments`,
      variant: "success" as const,
    },
    {
      label: "Gateway-only access declared",
      value: environments.filter((environment) => parseCapabilityProfile(environment.capabilities).profile.gateway_enforced).length,
      total: environments.length,
      valueText: "Environments expecting gateway-only access",
      variant: "warning" as const,
    },
    {
      label: "Metrics or reports declared",
      value: environments.filter((environment) => {
        const profile = parseCapabilityProfile(environment.capabilities).profile;
        return profile.metrics_enabled || profile.automation_reports_enabled;
      }).length,
      total: environments.length,
      valueText: "Environments with observability declarations",
      variant: "success" as const,
    },
    {
      label: "Content signing declared",
      value: environments.filter((environment) => parseCapabilityProfile(environment.capabilities).profile.content_signing_enabled).length,
      total: environments.length,
      valueText: "Environments with content signing declarations",
      variant: "warning" as const,
    },
  ];
  const operationalSignals = [
    {
      label: "Controller jobs",
      value: sumNumericMetric(environments, "controller", "job_count"),
      valueText: "Jobs discovered across controller integrations",
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
      value: sumNumericMetric(environments, "controller", "failed_jobs_recent"),
      valueText: "Failed jobs reported by recent controller queries",
      variant: "danger" as const,
    },
    {
      label: "Failed projects",
      value: sumNumericMetric(environments, "controller", "failed_projects_recent"),
      valueText: "Projects currently reporting a failed state",
      variant: "warning" as const,
    },
    {
      label: "EDA activations",
      value: activationCount,
      valueText: "Rulebook activations discovered across environments",
      variant: "success" as const,
    },
    {
      label: "Disabled activations",
      value: sumNumericMetric(environments, "eda", "disabled_activations"),
      valueText: "Activations currently disabled",
      variant: "warning" as const,
    },
    {
      label: "Hub collections",
      value: collectionCount,
      valueText: "Collections returned by automation hub APIs",
      variant: "success" as const,
    },
  ];

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Monitoring"
          title="Fleet monitoring and service posture"
          description="Review gateway, controller, EDA, and automation hub signals in one place, then drill into each registered environment for deeper detail and settings."
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
        <div className="aam-stat-row">
          <StatCard label="Environments" value={data.environment_count} detail="Registered AAP estates" />
          <StatCard label="Controllers monitored" value={controllerCount} detail="Controller collection enabled" />
          <StatCard label="EDA activations" value={activationCount} detail="Activations across the fleet" />
          <StatCard label="Hub collections" value={collectionCount} detail="Collections from automation hub" />
        </div>
      </StackItem>

      {environments.length === 0 ? (
        <StackItem>
          <Card >
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
            <div className="aam-monitoring-cards">
              <Card>
                <CardHeader>
                  <Title headingLevel="h2" size="lg">
                    Fleet service readiness
                  </Title>
                </CardHeader>
                <CardBody>
                  <div className="aam-health-table">
                    {serviceBreakdown.map((service) => (
                      <div key={service.service} className="aam-health-table__row">
                        <strong>{service.service.toUpperCase()}</strong>
                        <div className="aam-health-table__counts">
                          <Label color="green">{service.counts.healthy} healthy</Label>
                          <Label color="orange">{service.counts.warning} warning</Label>
                          <Label color="red">{service.counts.critical} critical</Label>
                          <Label color="grey">{service.counts.not_configured} not configured</Label>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
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
              <Card>
                <CardHeader>
                  <Title headingLevel="h2" size="lg">
                    Environment health scores
                  </Title>
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
            </div>
          </StackItem>

          <StackItem>
            <Card>
              <CardHeader>
                <Title headingLevel="h2" size="lg">
                  Environment monitoring profiles
                </Title>
              </CardHeader>
              <CardBody>
                <Gallery hasGutter minWidths={{ default: "280px", xl: "320px" }}>
                  {environments.map((environment) => (
                    <Card key={environment.id} className="aam-env-monitor-card" isCompact>
                      <CardHeader>
                        <Stack>
                          <StackItem>
                            <Title headingLevel="h3" size="md">
                              {environment.name}
                            </Title>
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
                              {monitoredServices.map((service) => (
                                <Label key={`${environment.id}-${service}`} isCompact>
                                  {service}: {getSnapshotHealth(environment.snapshots, service)}
                                </Label>
                              ))}
                            </div>
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
                                {monitoringPointGroups.map((group) => (
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
                  ))}
                </Gallery>
              </CardBody>
            </Card>
          </StackItem>
        </>
      )}
    </Stack>
  );
}
