import { FormEvent, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Stack,
  StackItem,
  TextArea,
  TextInput,
  Title,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import { api } from "../api";
import { useAuth } from "../auth";
import type { AccessDirectory, EnvironmentSummary } from "../types";

const emptyProvider = {
  id: "",
  name: "",
  provider_type: "oidc",
  enabled: false,
  allow_all_authenticated: false,
  configText: "{\n  \"issuer_url\": \"\",\n  \"client_id\": \"\",\n  \"group_mappings\": []\n}",
  secret: "",
};

export function AccessPage() {
  const { user: actor } = useAuth();
  const isSystemAdmin = actor?.system_roles?.includes("admin") ?? false;
  const [directory, setDirectory] = useState<AccessDirectory | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("environment-user");
  const [scope, setScope] = useState("environment");
  const [environmentId, setEnvironmentId] = useState("");
  const [principalType, setPrincipalType] = useState("user");
  const [principalId, setPrincipalId] = useState("");
  const [provider, setProvider] = useState(emptyProvider);

  async function reload() {
    const [nextDirectory, nextEnvironments] = await Promise.all([api.accessDirectory(), api.environments()]);
    setDirectory(nextDirectory);
    setEnvironments(nextEnvironments);
  }

  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Access data could not be loaded."));
  }, []);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.createAccessUser({ username, email: email || undefined, password, groups: ["users"] });
      setUsername("");
      setEmail("");
      setPassword("");
      setNotice("Local user created.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The user could not be created.");
    }
  }

  async function assignRole(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.createAssignment({
        role,
        scope,
        environment_id: scope === "environment" ? environmentId : "",
        principal_type: principalType,
        principal_id: principalId,
      });
      setNotice("Role assigned.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The role could not be assigned.");
    }
  }

  async function saveProvider(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(provider.configText) as Record<string, unknown>;
    } catch {
      setError("Provider configuration must be JSON.");
      return;
    }
    try {
      const body = {
        name: provider.name,
        provider_type: provider.provider_type,
        enabled: provider.enabled,
        allow_all_authenticated: provider.allow_all_authenticated,
        config,
        secret: provider.secret || null,
      };
      if (provider.id) {
        await api.updateIdentityProvider(provider.id, body);
      } else {
        await api.createIdentityProvider(body);
      }
      setProvider(emptyProvider);
      setNotice("Identity provider saved.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The identity provider could not be saved.");
    }
  }

  const users = directory?.users ?? [];
  const groups = directory?.groups ?? [];
  const principals = principalType === "group" ? groups : users;

  return (
    <Stack hasGutter>
      {error ? (
        <StackItem>
          <Alert variant="danger" isInline title={error} />
        </StackItem>
      ) : null}
      {notice ? (
        <StackItem>
          <Alert variant="success" isInline title={notice} />
        </StackItem>
      ) : null}
      <StackItem>
        <Card>
          <CardHeader>
            <Title headingLevel="h2" size="lg">
              Users
            </Title>
          </CardHeader>
          <CardBody>
            {users.length === 0 ? (
              <p className="aam-muted">No accounts yet.</p>
            ) : (
              <Table aria-label="Users" variant="compact">
                <Thead>
                  <Tr>
                    <Th>Username</Th>
                    <Th>Source</Th>
                    <Th>Groups</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {users.map((user) => (
                    <Tr key={user.id}>
                      <Td>{user.username}{user.is_builtin ? " (built-in)" : ""}</Td>
                      <Td>{user.source}</Td>
                      <Td>{user.groups.join(", ") || "none"}</Td>
                      <Td>{user.is_active ? "Active" : "Disabled"}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
            {isSystemAdmin ? (
              <div className="aam-form-section">
                <Form onSubmit={createUser}>
                  <FormGroup label="Username" fieldId="new-username" isRequired>
                    <TextInput id="new-username" value={username} onChange={(_event, value) => setUsername(value)} />
                  </FormGroup>
                  <FormGroup label="Email" fieldId="new-email">
                    <TextInput id="new-email" value={email} onChange={(_event, value) => setEmail(value)} />
                  </FormGroup>
                  <FormGroup label="Password" fieldId="new-password" isRequired>
                    <TextInput
                      id="new-password"
                      type="password"
                      value={password}
                      onChange={(_event, value) => setPassword(value)}
                    />
                  </FormGroup>
                  <Button type="submit" variant="primary">
                    Create local user
                  </Button>
                </Form>
              </div>
              ) : null}
          </CardBody>
        </Card>
      </StackItem>
      <StackItem>
        <Card>
          <CardHeader>
            <Title headingLevel="h2" size="lg">
              Role assignments
            </Title>
          </CardHeader>
          <CardBody>
            <Stack hasGutter>
              {(directory?.assignments ?? []).length === 0 ? (
                <StackItem>
                  <p className="aam-muted">No extra role assignments yet. Built-in group roles still apply.</p>
                </StackItem>
              ) : (
                <StackItem>
                  <Table aria-label="Role assignments" variant="compact">
                    <Thead>
                      <Tr>
                        <Th>Role</Th>
                        <Th>Scope</Th>
                        <Th>Principal</Th>
                        <Th />
                      </Tr>
                    </Thead>
                    <Tbody>
                      {(directory?.assignments ?? []).map((assignment) => {
                        const principal =
                          assignment.principal_type === "group"
                            ? groups.find((group) => group.id === assignment.principal_id)?.name
                            : users.find((user) => user.id === assignment.principal_id)?.username;
                        const estate = environments.find((environment) => environment.id === assignment.environment_id)?.name;
                        return (
                          <Tr key={assignment.id}>
                            <Td>{assignment.role}</Td>
                            <Td>{assignment.scope === "environment" ? estate || assignment.environment_id : "Platform"}</Td>
                            <Td>{principal || assignment.principal_id}</Td>
                            <Td>
                              <Button
                                variant="link"
                                isDanger
                                onClick={() =>
                                  api.deleteAssignment(assignment.id).then(reload).catch((err: unknown) =>
                                    setError(err instanceof Error ? err.message : "Could not remove the role."),
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </StackItem>
              )}
              <StackItem>
                <Form onSubmit={assignRole}>
                  <FormGroup label="Scope" fieldId="assign-scope">
                    <FormSelect id="assign-scope" value={scope} onChange={(_event, value) => setScope(value)}>
                      <FormSelectOption value="environment" label="Environment" />
                      {isSystemAdmin ? <FormSelectOption value="system" label="System" /> : null}
                    </FormSelect>
                  </FormGroup>
                  <FormGroup label="Role" fieldId="assign-role">
                    <FormSelect id="assign-role" value={role} onChange={(_event, value) => setRole(value)}>
                      {(scope === "environment" ? directory?.environment_roles : directory?.system_roles)?.map((item) => (
                        <FormSelectOption key={item} value={item} label={item} />
                      ))}
                    </FormSelect>
                  </FormGroup>
                  {scope === "environment" ? (
                    <FormGroup label="Environment" fieldId="assign-environment">
                      <FormSelect id="assign-environment" value={environmentId} onChange={(_event, value) => setEnvironmentId(value)}>
                        <FormSelectOption value="" label="Select an environment" />
                        {environments.map((environment) => (
                          <FormSelectOption key={environment.id} value={environment.id} label={environment.name} />
                        ))}
                      </FormSelect>
                    </FormGroup>
                  ) : null}
                  <FormGroup label="Principal" fieldId="assign-principal-type">
                    <FormSelect
                      id="assign-principal-type"
                      value={principalType}
                      onChange={(_event, value) => {
                        setPrincipalType(value);
                        setPrincipalId("");
                      }}
                    >
                      <FormSelectOption value="user" label="User" />
                      <FormSelectOption value="group" label="Group" />
                    </FormSelect>
                  </FormGroup>
                  <FormGroup label={principalType === "group" ? "Group" : "User"} fieldId="assign-principal">
                    <FormSelect id="assign-principal" value={principalId} onChange={(_event, value) => setPrincipalId(value)}>
                      <FormSelectOption value="" label="Select" />
                      {principals.map((item) => (
                        <FormSelectOption key={item.id} value={item.id} label={"username" in item ? item.username : item.name} />
                      ))}
                    </FormSelect>
                  </FormGroup>
                  <Button type="submit" variant="primary">
                    Assign role
                  </Button>
                </Form>
              </StackItem>
            </Stack>
          </CardBody>
        </Card>
      </StackItem>
      {isSystemAdmin ? (
      <StackItem>
        <Card>
          <CardHeader>
            <Title headingLevel="h2" size="lg">
              Identity providers
            </Title>
          </CardHeader>
          <CardBody>
            <Stack hasGutter>
              {(directory?.providers ?? []).map((item) => (
                <StackItem key={item.id}>
                  <strong>{item.name}</strong> · {item.provider_type} · {item.enabled ? "enabled" : "disabled"}
                  <Button
                    variant="link"
                    onClick={() =>
                      setProvider({
                        id: item.id,
                        name: item.name,
                        provider_type: item.provider_type,
                        enabled: item.enabled,
                        allow_all_authenticated: item.allow_all_authenticated,
                        configText: JSON.stringify(item.config ?? {}, null, 2),
                        secret: "",
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="link"
                    isDanger
                    onClick={() => api.deleteIdentityProvider(item.id).then(reload).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not remove the provider."))}
                  >
                    Remove
                  </Button>
                </StackItem>
              ))}
              <StackItem>
                <Form onSubmit={saveProvider}>
                  <FormGroup label="Name" fieldId="provider-name" isRequired>
                    <TextInput id="provider-name" value={provider.name} onChange={(_event, value) => setProvider({ ...provider, name: value })} />
                  </FormGroup>
                  <FormGroup label="Type" fieldId="provider-type">
                    <FormSelect
                      id="provider-type"
                      value={provider.provider_type}
                      onChange={(_event, value) => setProvider({ ...provider, provider_type: value })}
                    >
                      <FormSelectOption value="oidc" label="OpenID Connect" />
                      <FormSelectOption value="ldap" label="LDAP" />
                      <FormSelectOption value="ad" label="Active Directory" />
                    </FormSelect>
                  </FormGroup>
                  <Checkbox
                    id="provider-enabled"
                    label="Enabled"
                    isChecked={provider.enabled}
                    onChange={(_event, checked) => setProvider({ ...provider, enabled: checked })}
                  />
                  <Checkbox
                    id="provider-allow-all"
                    label="Allow every authenticated account into the users group"
                    isChecked={provider.allow_all_authenticated}
                    onChange={(_event, checked) => setProvider({ ...provider, allow_all_authenticated: checked })}
                  />
                  <FormGroup label="Configuration JSON" fieldId="provider-config">
                    <TextArea
                      id="provider-config"
                      value={provider.configText}
                      onChange={(_event, value) => setProvider({ ...provider, configText: value })}
                      rows={8}
                    />
                  </FormGroup>
                  <p>
                    OIDC uses issuer_url, client_id, groups_claim, and group_mappings. LDAP and Active Directory use url,
                    bind_dn, and user_base_dn. Put the client secret or bind password in the secret field.
                  </p>
                  <FormGroup label="Secret" fieldId="provider-secret">
                    <TextInput
                      id="provider-secret"
                      type="password"
                      value={provider.secret}
                      onChange={(_event, value) => setProvider({ ...provider, secret: value })}
                    />
                  </FormGroup>
                  <Button type="submit" variant="primary">
                    {provider.id ? "Save identity provider" : "Add identity provider"}
                  </Button>
                  {provider.id ? (
                    <Button type="button" variant="link" onClick={() => setProvider(emptyProvider)}>
                      Cancel edit
                    </Button>
                  ) : null}
                </Form>
              </StackItem>
            </Stack>
          </CardBody>
        </Card>
      </StackItem>
      ) : null}
    </Stack>
  );
}
