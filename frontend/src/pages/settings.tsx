import { useEffect, useState } from "react";

import {
  Alert,
  Bullseye,
  Button,
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
  Label,
  Stack,
  StackItem,
  Tab,
  Tabs,
  Content,
  TextInput,
  Title,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

import { api } from "../api";
import { useAuth } from "../auth";
import { EmptyState } from "../components/empty-state";
import { PageHeader } from "../components/page-header";
import { StatCard } from "../components/stat-card";
import type { EnvironmentSummary, RuntimeSettings } from "../types";
import { environmentKindLabel, formatDateTime } from "../utils";

export function SettingsLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManageAccess =
    user?.system_roles?.includes("admin") ||
    Object.values(user?.environment_roles ?? {}).some((roles) => roles.includes("environment-admin"));
  const tabs = [
    { key: "/settings/account", title: "Account" },
    ...(canManageAccess ? [{ key: "/settings/access", title: "Access" }] : []),
    { key: "/settings/application", title: "Application" },
  ];
  const active = tabs.some((tab) => location.pathname.startsWith(tab.key)) ? tabs.find((tab) => location.pathname.startsWith(tab.key))?.key : "/settings/application";

  if (location.pathname.startsWith("/settings/access") && !canManageAccess) {
    return <Navigate to="/settings/account" replace />;
  }

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Settings"
          title="Settings"
          description="Manage your account, who can use this hub, and how often each Ansible Automation Platform and Automation Orchestrator estate is refreshed."
        />
      </StackItem>
      <StackItem>
        <Tabs activeKey={active} onSelect={(_event, key) => navigate(String(key))} aria-label="Settings sections" component="nav" isNav>
          {tabs.map((tab) => (
            <Tab key={tab.key} eventKey={tab.key} title={tab.title} />
          ))}
        </Tabs>
      </StackItem>
      <Outlet />
    </Stack>
  );
}

function canEditRefresh(user: ReturnType<typeof useAuth>["user"], environmentId: string) {
  if (user?.system_roles?.includes("admin")) {
    return true;
  }
  const roles = user?.environment_roles?.[environmentId] ?? [];
  return roles.includes("environment-admin") || roles.includes("environment-user");
}

function CollectionRefresh() {
  const { user } = useAuth();
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowNotice, setRowNotice] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .environments(controller.signal)
      .then(setEnvironments)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Registered estates could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoaded(true);
        }
      });
    return () => controller.abort();
  }, []);

  async function save(environment: EnvironmentSummary) {
    const raw = drafts[environment.id] ?? String(environment.sync_interval_minutes);
    const minutes = Number.parseInt(raw, 10);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      setRowError((current) => ({ ...current, [environment.id]: "Enter a refresh interval from 1 to 1440 minutes." }));
      setRowNotice((current) => ({ ...current, [environment.id]: "" }));
      return;
    }
    setSavingId(environment.id);
    setRowError((current) => ({ ...current, [environment.id]: "" }));
    setRowNotice((current) => ({ ...current, [environment.id]: "" }));
    try {
      const updated = await api.updateEnvironment(environment.id, { sync_interval_minutes: minutes });
      setEnvironments((current) => current.map((item) => (item.id === environment.id ? { ...item, ...updated } : item)));
      setDrafts((current) => ({ ...current, [environment.id]: String(updated.sync_interval_minutes) }));
      setRowNotice((current) => ({
        ...current,
        [environment.id]: environment.is_managed === false ? "Saved. Collection stays paused until this registration is activated." : "Saved. The next collection uses this interval.",
      }));
    } catch (err) {
      setRowError((current) => ({
        ...current,
        [environment.id]: err instanceof Error ? err.message : "The refresh interval could not be saved.",
      }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Stack>
          <StackItem>
            <Title headingLevel="h2" size="lg">
              Collection refresh
            </Title>
          </StackItem>
          <StackItem>
            <Content component="p" className="aam-muted">
              Choose how often Advanced Automation Manager collects from each registered estate. Deactivating a registration pauses collection without changing this interval.
            </Content>
          </StackItem>
        </Stack>
      </CardHeader>
      <CardBody>
        {error ? <Alert isInline variant="danger" title={error} /> : null}
        {!error && loaded && environments.length === 0 ? (
          <EmptyState title="No estates registered" description="Register an Ansible Automation Platform or Automation Orchestrator estate to set its refresh interval." />
        ) : null}
        {environments.length > 0 ? (
          <Table aria-label="Collection refresh intervals" variant="compact">
            <Thead>
              <Tr>
                <Th>Estate</Th>
                <Th>Product</Th>
                <Th>Registration</Th>
                <Th>Last collected</Th>
                <Th>Refresh every</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {environments.map((environment) => {
                const editable = canEditRefresh(user, environment.id);
                const value = drafts[environment.id] ?? String(environment.sync_interval_minutes);
                const dirty = value !== String(environment.sync_interval_minutes);
                return (
                  <Tr key={environment.id}>
                    <Td dataLabel="Estate">{environment.name}</Td>
                    <Td dataLabel="Product">{environmentKindLabel(environment)}</Td>
                    <Td dataLabel="Registration">
                      {environment.is_managed === false ? <Label color="grey">Inactive</Label> : <Label color="green">Active</Label>}
                    </Td>
                    <Td dataLabel="Last collected">{formatDateTime(environment.last_synced_at)}</Td>
                    <Td dataLabel="Refresh every">
                      <TextInput
                        className="aam-refresh-input"
                        type="number"
                        aria-label={`Refresh interval for ${environment.name}`}
                        value={value}
                        min={1}
                        max={1440}
                        isDisabled={!editable || savingId === environment.id}
                        onChange={(_event, next) => setDrafts((current) => ({ ...current, [environment.id]: next }))}
                      />
                      <span className="aam-muted"> minutes</span>
                      {rowError[environment.id] ? <p className="aam-muted">{rowError[environment.id]}</p> : null}
                      {rowNotice[environment.id] ? <p className="aam-form-help">{rowNotice[environment.id]}</p> : null}
                    </Td>
                    <Td dataLabel="Save">
                      {editable ? (
                        <Button variant="secondary" isDisabled={!dirty || savingId === environment.id} isLoading={savingId === environment.id} onClick={() => save(environment)}>
                          Save
                        </Button>
                      ) : (
                        <span className="aam-muted">View only</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function ApplicationSettingsPage() {
  const { user } = useAuth();
  const isSystemAdmin = user?.system_roles?.includes("admin") ?? false;
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [loading, setLoading] = useState(isSystemAdmin);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSystemAdmin) {
      setLoading(false);
      return;
    }
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
  }, [isSystemAdmin]);

  return (
    <Stack hasGutter>
      <StackItem>
        <CollectionRefresh />
      </StackItem>

      {isSystemAdmin && loading && !settings ? (
        <StackItem>
          <Bullseye>
            <Card>
              <CardBody>Loading runtime settings...</CardBody>
            </Card>
          </Bullseye>
        </StackItem>
      ) : null}

      {isSystemAdmin && error && !settings ? (
        <StackItem>
          <Alert isInline variant="danger" title={`Runtime settings unavailable: ${error}`} />
        </StackItem>
      ) : null}

      {settings ? (
        <>
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
            <Card  isFullHeight>
              <CardHeader>
                <Stack>
                  <StackItem>
                    <Title headingLevel="h2" size="lg">
                      Trusted headers
                    </Title>
                  </StackItem>
                  <StackItem>
                    <Content component="p" className="aam-muted">
                      The gateway identity contract currently expected by the API.
                    </Content>
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
            <Card  isFullHeight>
              <CardHeader>
                <Stack>
                  <StackItem>
                    <Title headingLevel="h2" size="lg">
                      Runtime defaults
                    </Title>
                  </StackItem>
                  <StackItem>
                    <Content component="p" className="aam-muted">
                      These settings are loaded from the running backend configuration.
                    </Content>
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
            <Card >
              <CardHeader>
                <Stack>
                  <StackItem>
                    <Title headingLevel="h2" size="lg">
                      Operating notes
                    </Title>
                  </StackItem>
                  <StackItem>
                    <Content component="p" className="aam-muted">
                      Health, activity, topology, and search share the Monitoring section. Account, access, and collection refresh share Settings.
                    </Content>
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
                      Collection refresh for each estate is set in Application settings. Service authentication stays on the estate registration.
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Operational views</DescriptionListTerm>
                    <DescriptionListDescription>
                      Use Overview for fleet summary, Monitoring for health, activity, topology, and search, and Environments for registration.
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
      </StackItem>
        </>
      ) : null}
    </Stack>
  );
}
