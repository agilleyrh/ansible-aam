import { useEffect, useState } from "react";

import {
  Alert,
  Bullseye,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Gallery,
  Grid,
  GridItem,
  Stack,
  StackItem,
  Text,
  Title,
} from "@patternfly/react-core";

import { api } from "../api";
import { ActivityTable } from "../components/activity-table";
import { EmptyState } from "../components/empty-state";
import { PageHeader } from "../components/page-header";
import { StatCard } from "../components/stat-card";
import type { ActivityEvent, RuntimeSettings } from "../types";

export function SettingsPage() {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([api.runtimeSettings(controller.signal), api.activity(undefined, controller.signal)])
      .then(([settingsResult, activityResult]) => {
        if (controller.signal.aborted) {
          return;
        }
        if (settingsResult.status === "fulfilled") {
          setSettings(settingsResult.value);
        } else {
          setError(settingsResult.reason?.message ?? "Failed to load settings");
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

  if (loading && !settings) {
    return (
      <Bullseye>
        <Card isFlat>
          <CardBody>Loading runtime settings...</CardBody>
        </Card>
      </Bullseye>
    );
  }

  if (error && !settings) {
    return <Alert isInline variant="danger" title={`Runtime settings unavailable: ${error}`} />;
  }

  if (!settings) {
    return (
      <Bullseye>
        <Card isFlat>
          <CardBody>Loading runtime settings...</CardBody>
        </Card>
      </Bullseye>
    );
  }

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Runtime settings"
          title="Runtime settings and sync activity"
          description="Review the hub's current operating defaults, trusted headers, and the latest fleet synchronization jobs."
        />
      </StackItem>

      {error ? (
        <StackItem>
          <Alert isInline variant="warning" title={`Loaded with partial data: ${error}`} />
        </StackItem>
      ) : null}

      <StackItem>
        <Gallery hasGutter minWidths={{ default: "180px", lg: "220px" }}>
          <StatCard label="Mode" value={settings.environment} detail="Backend runtime environment" />
          <StatCard label="API prefix" value={settings.api_prefix} detail="Gateway path mounted by the API service" />
          <StatCard label="Default sync" value={`${settings.default_sync_interval_minutes}m`} detail="Scheduler fallback interval" />
          <StatCard label="Search limit" value={settings.search_result_limit} detail="Results returned per search request" />
        </Gallery>
      </StackItem>

      <StackItem>
        <Grid hasGutter>
          <GridItem lg={6}>
            <Card isFlat isFullHeight>
              <CardHeader>
                <Stack>
                  <StackItem>
                    <Title headingLevel="h2" size="lg">
                      Trusted headers
                    </Title>
                  </StackItem>
                  <StackItem>
                    <Text component="p" className="aam-muted">
                      The gateway identity contract currently expected by the API.
                    </Text>
                  </StackItem>
                </Stack>
              </CardHeader>
              <CardBody>
                {Object.keys(settings.trusted_headers).length === 0 ? (
                  <EmptyState
                    title="No trusted headers configured"
                    description="The API is not configured with any trusted gateway headers."
                  />
                ) : (
                  <DescriptionList isCompact isHorizontal columnModifier={{ default: "1Col" }}>
                    {Object.entries(settings.trusted_headers).map(([field, header]) => (
                      <DescriptionListGroup key={field}>
                        <DescriptionListTerm>{field}</DescriptionListTerm>
                        <DescriptionListDescription>{header}</DescriptionListDescription>
                      </DescriptionListGroup>
                    ))}
                  </DescriptionList>
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
                      Runtime defaults
                    </Title>
                  </StackItem>
                  <StackItem>
                    <Text component="p" className="aam-muted">
                      These settings are loaded from the running backend configuration.
                    </Text>
                  </StackItem>
                </Stack>
              </CardHeader>
              <CardBody>
                <DescriptionList isCompact isHorizontal columnModifier={{ default: "1Col" }}>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Request timeout</DescriptionListTerm>
                    <DescriptionListDescription>{settings.request_timeout_seconds} seconds</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Gateway trusted proxy</DescriptionListTerm>
                    <DescriptionListDescription>{settings.gateway_trusted_proxy ? "Enabled" : "Disabled"}</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>CORS origins</DescriptionListTerm>
                    <DescriptionListDescription>{settings.cors_origins.join(", ") || "Not configured"}</DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
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
                  Recent platform activity
                </Title>
              </StackItem>
              <StackItem>
                <Text component="p" className="aam-muted">
                  Review sync jobs and operator actions recorded by the control hub.
                </Text>
              </StackItem>
            </Stack>
          </CardHeader>
          <CardBody>
            {activity.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Register an AAP environment and queue its first sync to populate the activity stream."
              />
            ) : (
              <ActivityTable items={activity.slice(0, 12)} />
            )}
          </CardBody>
        </Card>
      </StackItem>
    </Stack>
  );
}
