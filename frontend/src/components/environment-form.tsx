import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  ActionGroup,
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Divider,
  ExpandableSection,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
  Stack,
  StackItem,
  Text,
  TextArea,
  TextInput,
  Title,
} from "@patternfly/react-core";

import { buildCapabilities, parseCapabilityProfile, type ManagementMode } from "../capabilities";
import type { EnvironmentAuthMode, EnvironmentDetail, EnvironmentMutationPayload } from "../types";

type SubmitOptions = {
  syncAfterSave: boolean;
};

type Props = {
  mode: "create" | "edit";
  initialValue?: EnvironmentDetail | null;
  busy?: boolean;
  title: string;
  description: string;
  submitLabel: string;
  errorMessage?: string | null;
  showSyncAfterSave?: boolean;
  showAdvancedSettings?: boolean;
  variant?: "card" | "plain";
  onSubmit: (payload: EnvironmentMutationPayload, options: SubmitOptions) => Promise<void> | void;
};

type FormState = {
  name: string;
  slug: string;
  description: string;
  owner: string;
  tags: string;
  groupings: string;
  labels: string;
  platform_url: string;
  gateway_url: string;
  controller_url: string;
  eda_url: string;
  hub_url: string;
  auth_mode: EnvironmentAuthMode;
  client_id: string;
  client_secret: string;
  access_token: string;
  verify_ssl: boolean;
  sync_interval_minutes: string;
  management_mode: ManagementMode;
  operator_namespace: string;
  cluster_namespace: string;
  terraform_workspace: string;
  backstage_entity_ref: string;
  mcp_endpoint: string;
  runner_enabled: boolean;
  builder_pipeline_enabled: boolean;
  receptor_mesh_enabled: boolean;
  receptor_node_count: string;
  execution_environments_expected: boolean;
  remote_execution_expected: boolean;
  content_signing_enabled: boolean;
  content_signing_expected: boolean;
  gateway_enforced: boolean;
  developer_portal_expected: boolean;
  mcp_expected: boolean;
  metrics_enabled: boolean;
  automation_reports_enabled: boolean;
  ai_assistant_enabled: boolean;
  extra_capabilities: string;
  service_paths: string;
};

type SectionProps = {
  title: string;
  description: string;
  children: ReactNode;
};

const emptyJson = "{}";

function toPrettyJson(value: Record<string, unknown> | null | undefined): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseObjectField(value: string, label: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function buildInitialState(initialValue?: EnvironmentDetail | null): FormState {
  const { profile, extraCapabilities } = parseCapabilityProfile(initialValue?.capabilities);
  return {
    name: initialValue?.name ?? "",
    slug: initialValue?.slug ?? "",
    description: initialValue?.description ?? "",
    owner: initialValue?.owner ?? "",
    tags: initialValue?.tags.join(", ") ?? "",
    groupings: initialValue?.groupings.join(", ") ?? "",
    labels: initialValue ? toPrettyJson(initialValue.labels) : emptyJson,
    platform_url: initialValue?.platform_url ?? "",
    gateway_url: initialValue?.gateway_url ?? "",
    controller_url: initialValue?.controller_url ?? "",
    eda_url: initialValue?.eda_url ?? "",
    hub_url: initialValue?.hub_url ?? "",
    auth_mode: initialValue?.auth_mode ?? "oauth2",
    client_id: initialValue?.client_id ?? "",
    client_secret: "",
    access_token: "",
    verify_ssl: initialValue?.verify_ssl ?? true,
    sync_interval_minutes: String(initialValue?.sync_interval_minutes ?? 5),
    management_mode: profile.management_mode,
    operator_namespace: profile.operator_namespace,
    cluster_namespace: profile.cluster_namespace,
    terraform_workspace: profile.terraform_workspace,
    backstage_entity_ref: profile.backstage_entity_ref,
    mcp_endpoint: profile.mcp_endpoint,
    runner_enabled: profile.runner_enabled,
    builder_pipeline_enabled: profile.builder_pipeline_enabled,
    receptor_mesh_enabled: profile.receptor_mesh_enabled,
    receptor_node_count: profile.receptor_node_count ? String(profile.receptor_node_count) : "",
    execution_environments_expected: profile.execution_environments_expected,
    remote_execution_expected: profile.remote_execution_expected,
    content_signing_enabled: profile.content_signing_enabled,
    content_signing_expected: profile.content_signing_expected,
    gateway_enforced: profile.gateway_enforced,
    developer_portal_expected: profile.developer_portal_expected,
    mcp_expected: profile.mcp_expected,
    metrics_enabled: profile.metrics_enabled,
    automation_reports_enabled: profile.automation_reports_enabled,
    ai_assistant_enabled: profile.ai_assistant_enabled,
    extra_capabilities: toPrettyJson(extraCapabilities),
    service_paths: initialValue ? toPrettyJson(initialValue.service_paths) : emptyJson,
  };
}

function FormSection({ title, description, children }: SectionProps) {
  return (
    <StackItem className="aam-form-section">
      <div>
        <Title headingLevel="h3" size="lg">
          {title}
        </Title>
        <Text component="p" className="aam-form-section__description">
          {description}
        </Text>
      </div>
      {children}
    </StackItem>
  );
}

function validateCredentialState(
  mode: "create" | "edit",
  authMode: EnvironmentAuthMode,
  clientId: string,
  clientSecret: string,
  accessToken: string,
) {
  if (mode !== "create") {
    return;
  }

  if (authMode === "header_passthrough") {
    return;
  }

  if (authMode === "service_account" && !accessToken.trim()) {
    throw new Error("Service account mode requires an access token when creating an environment.");
  }

  if (authMode === "oauth2" && !accessToken.trim() && !(clientId.trim() && clientSecret.trim())) {
    throw new Error("OAuth2 requires either an access token or both client ID and client secret.");
  }
}

export function EnvironmentForm({
  mode,
  initialValue,
  busy = false,
  title,
  description,
  submitLabel,
  errorMessage,
  showSyncAfterSave = true,
  showAdvancedSettings = mode === "edit",
  variant = "card",
  onSubmit,
}: Props) {
  const [form, setForm] = useState<FormState>(() => buildInitialState(initialValue));
  const [slugDirty, setSlugDirty] = useState(Boolean(initialValue?.slug));
  const [syncAfterSave, setSyncAfterSave] = useState(mode === "create");
  const [showMetadata, setShowMetadata] = useState(mode === "edit");
  const [showAdvanced, setShowAdvanced] = useState(mode === "edit");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setForm(buildInitialState(initialValue));
    setSlugDirty(Boolean(initialValue?.slug));
    setSyncAfterSave(mode === "create");
    setShowMetadata(mode === "edit");
    setShowAdvanced(mode === "edit");
    setLocalError(null);
  }, [initialValue, mode]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);

    try {
      validateCredentialState(mode, form.auth_mode, form.client_id, form.client_secret, form.access_token);

      const payload: EnvironmentMutationPayload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim(),
        owner: form.owner.trim(),
        tags: splitCsv(form.tags),
        groupings: splitCsv(form.groupings),
        labels: parseObjectField(form.labels, "Labels"),
        platform_url: form.platform_url.trim() || null,
        gateway_url: form.gateway_url.trim(),
        controller_url: form.controller_url.trim() || null,
        eda_url: form.eda_url.trim() || null,
        hub_url: form.hub_url.trim() || null,
        auth_mode: form.auth_mode,
        client_id: form.client_id.trim() || null,
        verify_ssl: form.verify_ssl,
        sync_interval_minutes: Number.parseInt(form.sync_interval_minutes, 10) || 5,
        capabilities: buildCapabilities(
          {
            management_mode: form.management_mode,
            operator_namespace: form.operator_namespace.trim(),
            cluster_namespace: form.cluster_namespace.trim(),
            terraform_workspace: form.terraform_workspace.trim(),
            backstage_entity_ref: form.backstage_entity_ref.trim(),
            mcp_endpoint: form.mcp_endpoint.trim(),
            runner_enabled: form.runner_enabled,
            builder_pipeline_enabled: form.builder_pipeline_enabled,
            receptor_mesh_enabled: form.receptor_mesh_enabled,
            receptor_node_count: Number.parseInt(form.receptor_node_count, 10) || null,
            execution_environments_expected: form.execution_environments_expected,
            remote_execution_expected: form.remote_execution_expected,
            content_signing_enabled: form.content_signing_enabled,
            content_signing_expected: form.content_signing_expected,
            gateway_enforced: form.gateway_enforced,
            developer_portal_expected: form.developer_portal_expected,
            mcp_expected: form.mcp_expected,
            metrics_enabled: form.metrics_enabled,
            automation_reports_enabled: form.automation_reports_enabled,
            ai_assistant_enabled: form.ai_assistant_enabled,
          },
          parseObjectField(form.extra_capabilities, "Additional capabilities"),
        ),
        service_paths: parseObjectField(form.service_paths, "Service path overrides"),
      };

      if (form.client_secret.trim()) {
        payload.client_secret = form.client_secret.trim();
      }
      if (form.access_token.trim()) {
        payload.access_token = form.access_token.trim();
      }

      if (!payload.name || !payload.slug || !payload.gateway_url) {
        throw new Error("Name, slug, and gateway URL are required.");
      }

      await onSubmit(payload, { syncAfterSave });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to save the environment.");
    }
  }

  const fieldPrefix = initialValue?.id ? `environment-${initialValue.id}` : `environment-${mode}`;
  const isPlain = variant === "plain";
  const formBody = (
    <Form onSubmit={handleSubmit} isWidthLimited={false}>
      <Stack hasGutter>
        {localError || errorMessage ? (
          <StackItem>
            <Alert isInline variant="danger" title={localError ?? errorMessage ?? "Unable to save the environment."} />
          </StackItem>
        ) : null}

        <FormSection
          title={mode === "create" ? "Registration basics" : "Identity and collection cadence"}
          description={
            mode === "create"
              ? "Start with the environment identity and how often the control hub should refresh it."
              : "Keep the registry identity, ownership, and collection cadence aligned with how this environment is operated."
          }
        >
          <Grid hasGutter>
            <GridItem md={6}>
              <FormGroup label="Display name" fieldId={`${fieldPrefix}-name`} isRequired>
                <TextInput
                  id={`${fieldPrefix}-name`}
                  value={form.name}
                  onChange={(_, value) => {
                    updateField("name", value);
                    if (mode === "create" && !slugDirty) {
                      updateField("slug", slugify(value));
                    }
                  }}
                  placeholder="AAP production east"
                />
              </FormGroup>
            </GridItem>
            <GridItem md={6}>
              <FormGroup label="Slug" fieldId={`${fieldPrefix}-slug`} isRequired>
                <TextInput
                  id={`${fieldPrefix}-slug`}
                  value={form.slug}
                  onChange={(_, value) => {
                    setSlugDirty(true);
                    updateField("slug", value);
                  }}
                  placeholder="aap-prod-east"
                />
              </FormGroup>
            </GridItem>
            <GridItem md={6}>
              <FormGroup label="Sync interval (minutes)" fieldId={`${fieldPrefix}-sync-interval`}>
                <TextInput
                  id={`${fieldPrefix}-sync-interval`}
                  type="number"
                  min={1}
                  value={form.sync_interval_minutes}
                  onChange={(_, value) => updateField("sync_interval_minutes", value)}
                />
              </FormGroup>
            </GridItem>
            <GridItem md={6}>
              <FormGroup label="Owner" fieldId={`${fieldPrefix}-owner`}>
                <TextInput
                  id={`${fieldPrefix}-owner`}
                  value={form.owner}
                  onChange={(_, value) => updateField("owner", value)}
                  placeholder="platform-team"
                />
              </FormGroup>
            </GridItem>
            <GridItem span={12}>
              <FormGroup label="Description" fieldId={`${fieldPrefix}-description`}>
                <TextArea
                  id={`${fieldPrefix}-description`}
                  value={form.description}
                  onChange={(_, value) => updateField("description", value)}
                  resizeOrientation="vertical"
                />
              </FormGroup>
            </GridItem>
          </Grid>
        </FormSection>

        <StackItem>
          <Divider />
        </StackItem>

        <FormSection
          title="Service endpoints"
          description="Register the platform gateway first, then add controller, EDA, and automation hub endpoints when they should be monitored directly."
        >
          <Grid hasGutter>
            <GridItem md={6}>
              <FormGroup label="Gateway URL" fieldId={`${fieldPrefix}-gateway-url`} isRequired>
                <TextInput
                  id={`${fieldPrefix}-gateway-url`}
                  value={form.gateway_url}
                  onChange={(_, value) => updateField("gateway_url", value)}
                  placeholder="https://aap.example.com"
                />
              </FormGroup>
            </GridItem>
            <GridItem md={6}>
              <FormGroup label="Platform URL" fieldId={`${fieldPrefix}-platform-url`}>
                <TextInput
                  id={`${fieldPrefix}-platform-url`}
                  value={form.platform_url}
                  onChange={(_, value) => updateField("platform_url", value)}
                  placeholder="https://aap.example.com"
                />
              </FormGroup>
            </GridItem>
            <GridItem md={4}>
              <FormGroup label="Controller URL" fieldId={`${fieldPrefix}-controller-url`}>
                <TextInput
                  id={`${fieldPrefix}-controller-url`}
                  value={form.controller_url}
                  onChange={(_, value) => updateField("controller_url", value)}
                  placeholder="https://controller.example.com"
                />
              </FormGroup>
            </GridItem>
            <GridItem md={4}>
              <FormGroup label="EDA URL" fieldId={`${fieldPrefix}-eda-url`}>
                <TextInput
                  id={`${fieldPrefix}-eda-url`}
                  value={form.eda_url}
                  onChange={(_, value) => updateField("eda_url", value)}
                  placeholder="https://eda.example.com"
                />
              </FormGroup>
            </GridItem>
            <GridItem md={4}>
              <FormGroup label="Automation Hub URL" fieldId={`${fieldPrefix}-hub-url`}>
                <TextInput
                  id={`${fieldPrefix}-hub-url`}
                  value={form.hub_url}
                  onChange={(_, value) => updateField("hub_url", value)}
                  placeholder="https://hub.example.com"
                />
              </FormGroup>
            </GridItem>
            <GridItem span={12}>
              <Checkbox
                id={`${fieldPrefix}-verify-ssl`}
                label="Verify TLS certificates"
                isChecked={form.verify_ssl}
                onChange={(_, checked) => updateField("verify_ssl", checked)}
              />
            </GridItem>
          </Grid>
        </FormSection>

        <StackItem>
          <Divider />
        </StackItem>

        <FormSection
          title="Collector authentication"
          description="Choose how the control hub should authenticate when reading platform health and inventory data."
        >
          <Grid hasGutter>
            <GridItem md={4}>
              <FormGroup label="Auth mode" fieldId={`${fieldPrefix}-auth-mode`}>
                <FormSelect
                  id={`${fieldPrefix}-auth-mode`}
                  value={form.auth_mode}
                  onChange={(_, value) => updateField("auth_mode", value as EnvironmentAuthMode)}
                >
                  <FormSelectOption value="oauth2" label="OAuth2 client credentials" />
                  <FormSelectOption value="service_account" label="Service account token" />
                  <FormSelectOption value="header_passthrough" label="Header passthrough" />
                </FormSelect>
              </FormGroup>
            </GridItem>
            <GridItem md={4}>
              <FormGroup label="Client ID" fieldId={`${fieldPrefix}-client-id`}>
                <TextInput
                  id={`${fieldPrefix}-client-id`}
                  value={form.client_id}
                  onChange={(_, value) => updateField("client_id", value)}
                  placeholder="aam-service-account"
                />
              </FormGroup>
            </GridItem>
            <GridItem md={4}>
              <FormGroup label={mode === "create" ? "Access token" : "Replace access token"} fieldId={`${fieldPrefix}-access-token`}>
                <TextInput
                  id={`${fieldPrefix}-access-token`}
                  type="password"
                  value={form.access_token}
                  onChange={(_, value) => updateField("access_token", value)}
                  placeholder={mode === "create" ? "Optional bearer token" : "Leave blank to keep current token"}
                />
              </FormGroup>
            </GridItem>
            {form.auth_mode === "oauth2" ? (
              <GridItem md={6}>
                <FormGroup label={mode === "create" ? "Client secret" : "Replace client secret"} fieldId={`${fieldPrefix}-client-secret`}>
                  <TextInput
                    id={`${fieldPrefix}-client-secret`}
                    type="password"
                    value={form.client_secret}
                    onChange={(_, value) => updateField("client_secret", value)}
                    placeholder={mode === "create" ? "Enter secret" : "Leave blank to keep current secret"}
                  />
                </FormGroup>
              </GridItem>
            ) : null}
            <GridItem span={12}>
              <Text component="small" className="aam-form-help">
                {form.auth_mode === "oauth2"
                  ? "Use an access token when one is already provisioned, or provide client credentials so the hub can request a token."
                  : form.auth_mode === "service_account"
                    ? "Register a long-lived service account token for collection."
                    : "Use this only when the UI and API are behind a trusted proxy that forwards platform identity headers."}
              </Text>
            </GridItem>
          </Grid>
        </FormSection>

        <StackItem>
          <ExpandableSection
            toggleText={mode === "create" ? "Optional ownership and grouping" : "Registry metadata"}
            isExpanded={showMetadata}
            onToggle={(_, expanded) => setShowMetadata(expanded)}
          >
            <Grid hasGutter className="aam-form-expandable">
              <GridItem md={6}>
                <FormGroup label="Tags" fieldId={`${fieldPrefix}-tags`}>
                  <TextInput
                    id={`${fieldPrefix}-tags`}
                    value={form.tags}
                    onChange={(_, value) => updateField("tags", value)}
                    placeholder="prod, finance, na"
                  />
                </FormGroup>
              </GridItem>
              <GridItem md={6}>
                <FormGroup label="Groups" fieldId={`${fieldPrefix}-groups`}>
                  <TextInput
                    id={`${fieldPrefix}-groups`}
                    value={form.groupings}
                    onChange={(_, value) => updateField("groupings", value)}
                    placeholder="business-unit-a, east-region"
                  />
                </FormGroup>
              </GridItem>
              {mode === "edit" ? (
                <GridItem span={12}>
                  <FormGroup label="Labels (JSON)" fieldId={`${fieldPrefix}-labels`}>
                    <TextArea
                      id={`${fieldPrefix}-labels`}
                      className="aam-code-field"
                      value={form.labels}
                      onChange={(_, value) => updateField("labels", value)}
                      resizeOrientation="vertical"
                      rows={5}
                    />
                  </FormGroup>
                </GridItem>
              ) : null}
            </Grid>
          </ExpandableSection>
        </StackItem>

        {showAdvancedSettings ? (
          <>
            <StackItem>
              <Divider />
            </StackItem>

            <StackItem>
              <ExpandableSection
                toggleText="Advanced platform declarations"
                isExpanded={showAdvanced}
                onToggle={(_, expanded) => setShowAdvanced(expanded)}
              >
                <Stack hasGutter className="aam-form-expandable">
                  <FormSection
                    title="Platform integration profile"
                    description="Declare lifecycle, runtime, content, and portal expectations that describe how this environment is operated."
                  >
                    <Grid hasGutter>
                      <GridItem md={4}>
                        <FormGroup label="Management mode" fieldId={`${fieldPrefix}-management-mode`}>
                          <FormSelect
                            id={`${fieldPrefix}-management-mode`}
                            value={form.management_mode}
                            onChange={(_, value) => updateField("management_mode", value as ManagementMode)}
                          >
                            <FormSelectOption value="manual" label="Manual" />
                            <FormSelectOption value="operator" label="Operator-managed" />
                            <FormSelectOption value="terraform" label="Terraform-managed" />
                            <FormSelectOption value="collection" label="Collection-driven" />
                          </FormSelect>
                        </FormGroup>
                      </GridItem>
                      <GridItem md={4}>
                        <FormGroup label="Operator namespace" fieldId={`${fieldPrefix}-operator-namespace`}>
                          <TextInput
                            id={`${fieldPrefix}-operator-namespace`}
                            value={form.operator_namespace}
                            onChange={(_, value) => updateField("operator_namespace", value)}
                            placeholder="aap-operator"
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem md={4}>
                        <FormGroup label="Cluster namespace" fieldId={`${fieldPrefix}-cluster-namespace`}>
                          <TextInput
                            id={`${fieldPrefix}-cluster-namespace`}
                            value={form.cluster_namespace}
                            onChange={(_, value) => updateField("cluster_namespace", value)}
                            placeholder="aap-prod"
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem md={4}>
                        <FormGroup label="Terraform workspace" fieldId={`${fieldPrefix}-terraform-workspace`}>
                          <TextInput
                            id={`${fieldPrefix}-terraform-workspace`}
                            value={form.terraform_workspace}
                            onChange={(_, value) => updateField("terraform_workspace", value)}
                            placeholder="aap-prod-east"
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem md={4}>
                        <FormGroup label="Backstage entity" fieldId={`${fieldPrefix}-backstage-entity-ref`}>
                          <TextInput
                            id={`${fieldPrefix}-backstage-entity-ref`}
                            value={form.backstage_entity_ref}
                            onChange={(_, value) => updateField("backstage_entity_ref", value)}
                            placeholder="system:default/aap-prod-east"
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem md={4}>
                        <FormGroup label="MCP endpoint" fieldId={`${fieldPrefix}-mcp-endpoint`}>
                          <TextInput
                            id={`${fieldPrefix}-mcp-endpoint`}
                            value={form.mcp_endpoint}
                            onChange={(_, value) => updateField("mcp_endpoint", value)}
                            placeholder="https://mcp.example.com"
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem md={4}>
                        <FormGroup label="Receptor nodes" fieldId={`${fieldPrefix}-receptor-node-count`}>
                          <TextInput
                            id={`${fieldPrefix}-receptor-node-count`}
                            type="number"
                            min={0}
                            value={form.receptor_node_count}
                            onChange={(_, value) => updateField("receptor_node_count", value)}
                            placeholder="3"
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={12}>
                        <Grid hasGutter>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-runner-enabled`}
                              label="Runner is in use"
                              isChecked={form.runner_enabled}
                              onChange={(_, checked) => updateField("runner_enabled", checked)}
                            />
                          </GridItem>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-builder-enabled`}
                              label="Execution environment builder is in use"
                              isChecked={form.builder_pipeline_enabled}
                              onChange={(_, checked) => updateField("builder_pipeline_enabled", checked)}
                            />
                          </GridItem>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-receptor-enabled`}
                              label="Receptor mesh is in use"
                              isChecked={form.receptor_mesh_enabled}
                              onChange={(_, checked) => updateField("receptor_mesh_enabled", checked)}
                            />
                          </GridItem>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-ees-expected`}
                              label="Execution environments are expected"
                              isChecked={form.execution_environments_expected}
                              onChange={(_, checked) => updateField("execution_environments_expected", checked)}
                            />
                          </GridItem>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-remote-execution-expected`}
                              label="Remote execution is expected"
                              isChecked={form.remote_execution_expected}
                              onChange={(_, checked) => updateField("remote_execution_expected", checked)}
                            />
                          </GridItem>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-gateway-enforced`}
                              label="Gateway-only access is expected"
                              isChecked={form.gateway_enforced}
                              onChange={(_, checked) => updateField("gateway_enforced", checked)}
                            />
                          </GridItem>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-content-signing-enabled`}
                              label="Content signing is enabled"
                              isChecked={form.content_signing_enabled}
                              onChange={(_, checked) => updateField("content_signing_enabled", checked)}
                            />
                          </GridItem>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-content-signing-expected`}
                              label="Content signing is expected"
                              isChecked={form.content_signing_expected}
                              onChange={(_, checked) => updateField("content_signing_expected", checked)}
                            />
                          </GridItem>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-metrics-enabled`}
                              label="Metrics collection is declared"
                              isChecked={form.metrics_enabled}
                              onChange={(_, checked) => updateField("metrics_enabled", checked)}
                            />
                          </GridItem>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-automation-reports-enabled`}
                              label="Automation reports are declared"
                              isChecked={form.automation_reports_enabled}
                              onChange={(_, checked) => updateField("automation_reports_enabled", checked)}
                            />
                          </GridItem>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-developer-portal-expected`}
                              label="Developer portal registration is expected"
                              isChecked={form.developer_portal_expected}
                              onChange={(_, checked) => updateField("developer_portal_expected", checked)}
                            />
                          </GridItem>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-mcp-expected`}
                              label="MCP access is expected"
                              isChecked={form.mcp_expected}
                              onChange={(_, checked) => updateField("mcp_expected", checked)}
                            />
                          </GridItem>
                          <GridItem md={4}>
                            <Checkbox
                              id={`${fieldPrefix}-ai-assistant-enabled`}
                              label="AI assistance is declared"
                              isChecked={form.ai_assistant_enabled}
                              onChange={(_, checked) => updateField("ai_assistant_enabled", checked)}
                            />
                          </GridItem>
                        </Grid>
                      </GridItem>
                    </Grid>
                  </FormSection>

                  <FormSection
                    title="Advanced API behavior"
                    description="Only use these fields when a platform deviates from standard AAP endpoints or you need extra unstructured metadata."
                  >
                    <Grid hasGutter>
                      <GridItem span={12}>
                        <FormGroup label="Service path overrides (JSON)" fieldId={`${fieldPrefix}-service-paths`}>
                          <TextArea
                            id={`${fieldPrefix}-service-paths`}
                            className="aam-code-field"
                            value={form.service_paths}
                            onChange={(_, value) => updateField("service_paths", value)}
                            resizeOrientation="vertical"
                            rows={6}
                          />
                        </FormGroup>
                      </GridItem>
                      <GridItem span={12}>
                        <FormGroup label="Additional capability flags (JSON)" fieldId={`${fieldPrefix}-extra-capabilities`}>
                          <TextArea
                            id={`${fieldPrefix}-extra-capabilities`}
                            className="aam-code-field"
                            value={form.extra_capabilities}
                            onChange={(_, value) => updateField("extra_capabilities", value)}
                            resizeOrientation="vertical"
                            rows={6}
                          />
                        </FormGroup>
                      </GridItem>
                    </Grid>
                  </FormSection>
                </Stack>
              </ExpandableSection>
            </StackItem>
          </>
        ) : (
          <StackItem>
            <Alert
              isInline
              variant="info"
              title="Advanced integration declarations stay available after registration."
            />
          </StackItem>
        )}

        {showSyncAfterSave ? (
          <StackItem>
            <Checkbox
              id={`${fieldPrefix}-sync-after-save`}
              label={mode === "create" ? "Queue an initial sync after registration" : "Queue a sync after saving settings"}
              isChecked={syncAfterSave}
              onChange={(_, checked) => setSyncAfterSave(checked)}
            />
          </StackItem>
        ) : null}

        <StackItem>
          <ActionGroup>
            <Button type="submit" variant="primary" isLoading={busy} isDisabled={busy}>
              {busy ? "Saving..." : submitLabel}
            </Button>
          </ActionGroup>
        </StackItem>
      </Stack>
    </Form>
  );

  if (isPlain) {
    return formBody;
  }

  return (
    <Card isFlat>
      <CardHeader>
        <Stack hasGutter>
          <StackItem>
            <Title headingLevel="h2" size="xl">
              {title}
            </Title>
          </StackItem>
          <StackItem>
            <Text component="p" className="aam-muted">
              {description}
            </Text>
          </StackItem>
        </Stack>
      </CardHeader>
      <CardBody>{formBody}</CardBody>
    </Card>
  );
}
