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
import { EmptyState } from "../components/empty-state";
import { PageHeader } from "../components/page-header";
import { StatCard } from "../components/stat-card";
import type { RuntimeSettings } from "../types";

export function SettingsPage() {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([api.runtimeSettings(controller.signal)])
      .then(([settingsResult]) => {
        if (controller.signal.aborted) {
          return;
        }
        if (settingsResult.status === "fulfilled") {
          setSettings(settingsResult.value);
        } else {
          setError(settingsResult.reason?.message ?? "Failed to load settings");
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
          section="Administration"
          title="Runtime settings and deployment profile"
          description="Review the running backend defaults, trusted headers, and the core settings that shape how the control hub behaves."
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
          <GridItem lg={12}>
            <Card isFlat>
              <CardHeader>
                <Stack>
                  <StackItem>
                    <Title headingLevel="h2" size="lg">
                      Operating notes
                    </Title>
                  </StackItem>
                  <StackItem>
                    <Text component="p" className="aam-muted">
                      Monitoring, activity, and environment registration are intentionally separated now. Use the monitoring page for collected signals, the activity page for sync and action history, and environment settings for platform-specific declarations.
                    </Text>
                  </StackItem>
                </Stack>
              </CardHeader>
              <CardBody>
                <DescriptionList isCompact isHorizontal columnModifier={{ default: "1Col" }}>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Identity model</DescriptionListTerm>
                    <DescriptionListDescription>
                      Runtime identity is derived from trusted proxy headers when the platform is deployed behind a supported gateway.
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Collection model</DescriptionListTerm>
                    <DescriptionListDescription>
                      Environment sync cadence and service authentication are configured per environment in the registry, not in global runtime settings.
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Operational views</DescriptionListTerm>
                    <DescriptionListDescription>
                      Use Overview for fleet summary, Monitoring for platform signals, Environments for registration and settings, and Activity for operator actions and sync history.
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
      </StackItem>
    </Stack>
  );
}
