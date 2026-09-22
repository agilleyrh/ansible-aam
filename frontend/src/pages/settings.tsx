import { useEffect, useState, type FormEvent } from "react";

import {
  Alert,
  Bullseye,
  Button,
  Checkbox,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  ExpandableSection,
  Form,
  FormGroup,
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
import type { EnvironmentSummary, HubPreferences, RuntimeSettings } from "../types";
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
          description="Account is your sign-in. Access decides who can use the hub. Application settings are the values you can change for this hub."
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

function HubPreferencesForm({ onSaved }: { onSaved?: () => void }) {
  const { user } = useAuth();
  const canEdit = user?.system_roles?.includes("admin") ?? false;
  const [prefs, setPrefs] = useState<HubPreferences | null>(null);
  const [applyToAll, setApplyToAll] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .hubPreferences(controller.signal)
      .then(setPrefs)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Application settings could not be loaded.");
        }
      });
    return () => controller.abort();
  }, []);

  function update<K extends keyof HubPreferences>(field: K, value: HubPreferences[K]) {
    setPrefs((current) => (current ? { ...current, [field]: value } : current));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!prefs) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await api.updateHubPreferences({ ...prefs, apply_sync_interval_to_all: applyToAll });
      setPrefs(saved);
      setNotice(applyToAll ? "Saved. Every registered estate now uses this collection interval." : "Application settings saved.");
      setApplyToAll(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Application settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <Stack>
          <StackItem>
            <Title headingLevel="h2" size="lg">
              Application settings
            </Title>
          </StackItem>
          <StackItem>
            <Content component="p" className="aam-muted">
              These values control this hub. Save them here. They apply to new registrations and to how the hub talks to Ansible Automation Platform and Automation Orchestrator.
            </Content>
          </StackItem>
        </Stack>
      </CardHeader>
      <CardBody>
        {error ? <Alert isInline variant="danger" title={error} /> : null}
        {notice ? <Alert isInline variant="success" title={notice} /> : null}
        {!prefs ? (
          <p className="aam-muted">Loading application settings...</p>
        ) : (
          <Form onSubmit={save}>
            <FormGroup label="Default collection refresh" fieldId="pref-sync">
              <TextInput
                id="pref-sync"
                type="number"
                min={1}
                max={1440}
                value={String(prefs.default_sync_interval_minutes)}
                isDisabled={!canEdit || busy}
                onChange={(_event, value) => update("default_sync_interval_minutes", Number.parseInt(value, 10) || 0)}
              />
              <p className="aam-form-help">Minutes. New estates start here. Use the checkbox to apply it to estates that are already registered.</p>
            </FormGroup>
            <Checkbox
              id="pref-apply-all"
              label="Apply this refresh interval to every registered estate"
              isChecked={applyToAll}
              isDisabled={!canEdit || busy}
              onChange={(_event, checked) => setApplyToAll(checked)}
            />
            <FormGroup label="Session length" fieldId="pref-session">
              <TextInput
                id="pref-session"
                type="number"
                min={15}
                max={10080}
                value={String(prefs.session_ttl_minutes)}
                isDisabled={!canEdit || busy}
                onChange={(_event, value) => update("session_ttl_minutes", Number.parseInt(value, 10) || 0)}
              />
              <p className="aam-form-help">Minutes before a new sign-in expires. Current sessions keep the length they were issued with.</p>
            </FormGroup>
            <FormGroup label="Search results" fieldId="pref-search">
              <TextInput
                id="pref-search"
                type="number"
                min={5}
                max={200}
                value={String(prefs.search_result_limit)}
                isDisabled={!canEdit || busy}
                onChange={(_event, value) => update("search_result_limit", Number.parseInt(value, 10) || 0)}
              />
              <p className="aam-form-help">Maximum inventory matches returned by Search.</p>
            </FormGroup>
            <FormGroup label="Remote request timeout" fieldId="pref-timeout">
              <TextInput
                id="pref-timeout"
                type="number"
                min={5}
                max={120}
                value={String(prefs.request_timeout_seconds)}
                isDisabled={!canEdit || busy}
                onChange={(_event, value) => update("request_timeout_seconds", Number.parseInt(value, 10) || 0)}
              />
              <p className="aam-form-help">Seconds to wait for Ansible Automation Platform or Automation Orchestrator.</p>
            </FormGroup>
            <FormGroup label="Scheduler check" fieldId="pref-scheduler">
              <TextInput
                id="pref-scheduler"
                type="number"
                min={15}
                max={300}
                value={String(prefs.scheduler_interval_seconds)}
                isDisabled={!canEdit || busy}
                onChange={(_event, value) => update("scheduler_interval_seconds", Number.parseInt(value, 10) || 0)}
              />
              <p className="aam-form-help">Seconds between checks for estates that are due to be collected.</p>
            </FormGroup>
            <Checkbox
              id="pref-local-login"
              label="Allow local accounts other than the built-in administrator"
              description={prefs.local_login_locked ? "The running service has turned local sign-in off. The built-in administrator can still sign in." : "Directory and OpenID Connect accounts are unaffected."}
              isChecked={prefs.local_login_enabled && !prefs.local_login_locked}
              isDisabled={!canEdit || busy || prefs.local_login_locked}
              onChange={(_event, checked) => update("local_login_enabled", checked)}
            />
            {canEdit ? (
              <Button type="submit" variant="primary" isLoading={busy} isDisabled={busy}>
                Save application settings
              </Button>
            ) : (
              <p className="aam-muted">A system administrator can change these settings.</p>
            )}
          </Form>
        )}
      </CardBody>
    </Card>
  );
}

function CollectionRefresh({ refreshToken = 0 }: { refreshToken?: number }) {
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
  }, [refreshToken]);

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
  const [collectionRefreshToken, setCollectionRefreshToken] = useState(0);
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
        <HubPreferencesForm onSaved={() => setCollectionRefreshToken((current) => current + 1)} />
      </StackItem>
      <StackItem>
        <CollectionRefresh refreshToken={collectionRefreshToken} />
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
        <StackItem>
          <ExpandableSection toggleText="Deployment profile" displaySize="lg">
            <Stack hasGutter>
              <StackItem>
                <Content component="p" className="aam-muted">
                  These values come from the running service. Change them in the deployment configuration, not here.
                </Content>
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
                    <DescriptionListTerm>Process request timeout</DescriptionListTerm>
                    <DescriptionListDescription>{settings.request_timeout_seconds} seconds. Remote calls use the saved application setting.</DescriptionListDescription>
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
            </Stack>
          </ExpandableSection>
        </StackItem>
      ) : null}
    </Stack>
  );
}
