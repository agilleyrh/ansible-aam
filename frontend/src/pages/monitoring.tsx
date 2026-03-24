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
  Stack,
  StackItem,
  Text,
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
        <Card isFlat>
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
        <Card isFlat>
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
        <Gallery hasGutter minWidths={{ default: "180px", lg: "220px" }}>
          <StatCard label="Environments" value={data.environment_count} detail="AAP environments registered to the hub" />
          <StatCard label="Controllers monitored" value={controllerCount} detail="Environments with controller collection enabled" />
          <StatCard label="EDA activations" value={activationCount} detail="Rulebook activations discovered across the fleet" />
          <StatCard label="Hub collections" value={collectionCount} detail="Collections surfaced by automation hub" />
        </Gallery>
      </StackItem>

      {environments.length === 0 ? (
        <StackItem>
          <Card isFlat>
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
            <Grid hasGutter>
              <GridItem lg={6}>
                <Card isFlat isFullHeight>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          Fleet service readiness
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Text component="p" className="aam-muted">
                          Health distribution for the gateway, controller, EDA, and automation hub surfaces collected from each environment.
                        </Text>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    <Stack hasGutter>
                      {serviceBreakdown.map((service) => (
                        <StackItem key={service.service}>
                          <Title headingLevel="h3" size="md">
                            {service.service.toUpperCase()}
                          </Title>
                          <MetricBarChart
                            items={[
                              {
                                label: "Healthy",
                                value: service.counts.healthy,
                                total: service.total,
                                valueText: `${service.counts.healthy} of ${service.total} environments`,
                                variant: "success",
                              },
                              {
                                label: "Warning",
                                value: service.counts.warning,
                                total: service.total,
                                valueText: `${service.counts.warning} of ${service.total} environments`,
                                variant: "warning",
                              },
                              {
                                label: "Critical",
                                value: service.counts.critical,
                                total: service.total,
                                valueText: `${service.counts.critical} of ${service.total} environments`,
                                variant: "danger",
                              },
                              {
                                label: "Not configured",
                                value: service.counts.not_configured,
                                total: service.total,
                                valueText: `${service.counts.not_configured} of ${service.total} environments`,
                              },
                            ]}
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
                          Operational signals
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Text component="p" className="aam-muted">
                          High-value controller, EDA, and hub metrics surfaced from the latest collection snapshots.
                        </Text>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    <MetricBarChart items={operationalSignals} emptyText="No operational signals collected yet." />
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
                          Health scores derived from the latest service snapshots for each environment.
                        </Text>
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
              </GridItem>
              <GridItem lg={6}>
                <Card isFlat isFullHeight>
                  <CardHeader>
                    <Stack>
                      <StackItem>
                        <Title headingLevel="h2" size="lg">
                          Collection configuration coverage
                        </Title>
                      </StackItem>
                      <StackItem>
                        <Text component="p" className="aam-muted">
                          Runtime and interface declarations that affect how each environment is monitored and governed.
                        </Text>
                      </StackItem>
                    </Stack>
                  </CardHeader>
                  <CardBody>
                    <MetricBarChart items={configurationCoverage} emptyText="No configuration coverage data available." />
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
                      Environment monitoring profiles
                    </Title>
                  </StackItem>
                  <StackItem>
                    <Text component="p" className="aam-muted">
                      Each card consolidates service health, the common monitoring points collected for that environment, and the registration settings that change collection behavior.
                    </Text>
                  </StackItem>
                </Stack>
              </CardHeader>
              <CardBody>
                <Gallery hasGutter minWidths={{ default: "340px", xl: "380px" }}>
                  {environments.map((environment) => (
                    <Card key={environment.id} isFlat isFullHeight isCompact>
                      <CardHeader>
                        <Stack hasGutter>
                          <StackItem>
                            <Title headingLevel="h3" size="lg">
                              {environment.name}
                            </Title>
                          </StackItem>
                          <StackItem>
                            <Text component="small" className="aam-muted">
                              Last sync {formatDateTime(environment.last_synced_at)}
                            </Text>
                          </StackItem>
                        </Stack>
                      </CardHeader>
                      <CardBody>
                        <Stack hasGutter>
                          <StackItem>
                            <div className="aam-link-cluster">
                              <StatusPill status={environment.status} />
                              {monitoredServices.map((service) => (
                                <div key={`${environment.id}-${service}`}>
                                  <Text component="small" className="aam-muted">
                                    {service.toUpperCase()}
                                  </Text>
                                  <div>
                                    <StatusPill status={getSnapshotHealth(environment.snapshots, service)} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </StackItem>
                          <StackItem>
                            <Text component="small" className="aam-muted">
                              Collection profile
                            </Text>
                            <div className="aam-summary-grid">
                              {getCollectionProfile(environment).map((item) => (
                                <div key={`${environment.id}-${item.label}`} className="aam-summary-grid__item">
                                  <Text component="small" className="aam-muted">
                                    {item.label}
                                  </Text>
                                  <div>{item.value}</div>
                                </div>
                              ))}
                            </div>
                          </StackItem>
                          {monitoringPointGroups.map((group) => (
                            <StackItem key={`${environment.id}-${group.id}`}>
                              <Text component="small" className="aam-muted">
                                {group.title}
                              </Text>
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
                            </StackItem>
                          ))}
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
