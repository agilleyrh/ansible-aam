import { FormEvent, useEffect, useState } from "react";

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

export function EnvironmentForm({
  mode,
  initialValue,
  busy = false,
  title,
  description,
  submitLabel,
  errorMessage,
  showSyncAfterSave = true,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<FormState>(() => buildInitialState(initialValue));
  const [slugDirty, setSlugDirty] = useState(Boolean(initialValue?.slug));
  const [syncAfterSave, setSyncAfterSave] = useState(mode === "create");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setForm(buildInitialState(initialValue));
    setSlugDirty(Boolean(initialValue?.slug));
    setSyncAfterSave(mode === "create");
    setLocalError(null);
  }, [initialValue, mode]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);

    try {
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

  return (
    <section className="card card--flat">
      <div className="card__header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>

      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="form-section">
          <div className="form-section__header">
            <h4>Identity</h4>
            <p>Give the environment a stable inventory name and ownership metadata.</p>
          </div>
          <div className="form-grid form-grid--two">
            <label className="field-group">
              <span className="field-label">Display name</span>
              <input
                className="text-input"
                value={form.name}
                onChange={(event) => {
                  const name = event.target.value;
                  updateField("name", name);
                  if (mode === "create" && !slugDirty) {
                    updateField("slug", slugify(name));
                  }
                }}
                placeholder="AAP production east"
              />
            </label>
            <label className="field-group">
              <span className="field-label">Slug</span>
              <input
                className="text-input"
                value={form.slug}
                onChange={(event) => {
                  setSlugDirty(true);
                  updateField("slug", event.target.value);
                }}
                placeholder="aap-prod-east"
              />
            </label>
            <label className="field-group">
              <span className="field-label">Owner</span>
              <input className="text-input" value={form.owner} onChange={(event) => updateField("owner", event.target.value)} placeholder="platform-team" />
            </label>
            <label className="field-group">
              <span className="field-label">Sync interval (minutes)</span>
              <input
                className="text-input"
                type="number"
                min={1}
                value={form.sync_interval_minutes}
                onChange={(event) => updateField("sync_interval_minutes", event.target.value)}
              />
            </label>
          </div>
          <label className="field-group">
            <span className="field-label">Description</span>
            <textarea className="text-area" rows={3} value={form.description} onChange={(event) => updateField("description", event.target.value)} />
          </label>
          <div className="form-grid form-grid--two">
            <label className="field-group">
              <span className="field-label">Tags</span>
              <input className="text-input" value={form.tags} onChange={(event) => updateField("tags", event.target.value)} placeholder="prod, finance, na" />
            </label>
            <label className="field-group">
              <span className="field-label">Groups</span>
              <input className="text-input" value={form.groupings} onChange={(event) => updateField("groupings", event.target.value)} placeholder="business-unit-a, east-region" />
            </label>
          </div>
          <label className="field-group">
            <span className="field-label">Labels (JSON)</span>
            <textarea className="text-area text-area--code" rows={5} value={form.labels} onChange={(event) => updateField("labels", event.target.value)} />
          </label>
        </div>

        <div className="form-section">
          <div className="form-section__header">
            <h4>Connectivity</h4>
            <p>Define the gateway entry point and the component APIs that should be monitored.</p>
          </div>
          <div className="form-grid form-grid--two">
            <label className="field-group">
              <span className="field-label">Platform URL</span>
              <input className="text-input" value={form.platform_url} onChange={(event) => updateField("platform_url", event.target.value)} placeholder="https://aap.example.com" />
            </label>
            <label className="field-group">
              <span className="field-label">Gateway URL</span>
              <input className="text-input" value={form.gateway_url} onChange={(event) => updateField("gateway_url", event.target.value)} placeholder="https://aap.example.com" />
            </label>
            <label className="field-group">
              <span className="field-label">Controller URL</span>
              <input className="text-input" value={form.controller_url} onChange={(event) => updateField("controller_url", event.target.value)} placeholder="https://aap.example.com" />
            </label>
            <label className="field-group">
              <span className="field-label">EDA URL</span>
              <input className="text-input" value={form.eda_url} onChange={(event) => updateField("eda_url", event.target.value)} placeholder="https://eda.example.com" />
            </label>
            <label className="field-group">
              <span className="field-label">Automation Hub URL</span>
              <input className="text-input" value={form.hub_url} onChange={(event) => updateField("hub_url", event.target.value)} placeholder="https://hub.example.com" />
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.verify_ssl} onChange={(event) => updateField("verify_ssl", event.target.checked)} />
              <span>Verify TLS certificates</span>
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section__header">
            <h4>Authentication</h4>
            <p>Choose the credential pattern used to collect health and inventory data.</p>
          </div>
          <div className="form-grid form-grid--two">
            <label className="field-group">
              <span className="field-label">Auth mode</span>
              <select className="select-input" value={form.auth_mode} onChange={(event) => updateField("auth_mode", event.target.value as EnvironmentAuthMode)}>
                <option value="oauth2">OAuth2</option>
                <option value="service_account">Service account token</option>
                <option value="header_passthrough">Header passthrough</option>
              </select>
            </label>
            <label className="field-group">
              <span className="field-label">Client ID</span>
              <input className="text-input" value={form.client_id} onChange={(event) => updateField("client_id", event.target.value)} placeholder="aam-service-account" />
            </label>
            <label className="field-group">
              <span className="field-label">{mode === "create" ? "Client secret" : "Replace client secret"}</span>
              <input className="text-input" type="password" value={form.client_secret} onChange={(event) => updateField("client_secret", event.target.value)} placeholder={mode === "create" ? "Enter secret" : "Leave blank to keep current secret"} />
            </label>
            <label className="field-group">
              <span className="field-label">{mode === "create" ? "Access token" : "Replace access token"}</span>
              <input className="text-input" type="password" value={form.access_token} onChange={(event) => updateField("access_token", event.target.value)} placeholder={mode === "create" ? "Optional bearer token" : "Leave blank to keep current token"} />
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section__header">
            <h4>Provisioning and lifecycle</h4>
            <p>Declare how this estate is installed and managed across the AAP ecosystem.</p>
          </div>
          <div className="form-grid form-grid--two">
            <label className="field-group">
              <span className="field-label">Management mode</span>
              <select className="select-input" value={form.management_mode} onChange={(event) => updateField("management_mode", event.target.value as ManagementMode)}>
                <option value="manual">Manual</option>
                <option value="operator">Operator</option>
                <option value="terraform">Terraform</option>
                <option value="collection">Ansible collection</option>
              </select>
            </label>
            <label className="field-group">
              <span className="field-label">Operator namespace</span>
              <input className="text-input" value={form.operator_namespace} onChange={(event) => updateField("operator_namespace", event.target.value)} placeholder="aap" />
            </label>
            <label className="field-group">
              <span className="field-label">Cluster namespace</span>
              <input className="text-input" value={form.cluster_namespace} onChange={(event) => updateField("cluster_namespace", event.target.value)} placeholder="automation-platform" />
            </label>
            <label className="field-group">
              <span className="field-label">Terraform workspace</span>
              <input className="text-input" value={form.terraform_workspace} onChange={(event) => updateField("terraform_workspace", event.target.value)} placeholder="aap-prod-east" />
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section__header">
            <h4>Runtime and content operations</h4>
            <p>Track the execution and trust surfaces shaped by runner, builder, execution environments, and receptor.</p>
          </div>
          <div className="form-grid form-grid--two">
            <label className="checkbox-field">
              <input type="checkbox" checked={form.runner_enabled} onChange={(event) => updateField("runner_enabled", event.target.checked)} />
              <span>Ansible Runner is part of this estate</span>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.builder_pipeline_enabled} onChange={(event) => updateField("builder_pipeline_enabled", event.target.checked)} />
              <span>Execution environment builder pipeline exists</span>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.execution_environments_expected} onChange={(event) => updateField("execution_environments_expected", event.target.checked)} />
              <span>Execution environments are expected</span>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.remote_execution_expected} onChange={(event) => updateField("remote_execution_expected", event.target.checked)} />
              <span>Remote execution is expected</span>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.receptor_mesh_enabled} onChange={(event) => updateField("receptor_mesh_enabled", event.target.checked)} />
              <span>Receptor mesh is declared</span>
            </label>
            <label className="field-group">
              <span className="field-label">Receptor node count</span>
              <input className="text-input" type="number" min={0} value={form.receptor_node_count} onChange={(event) => updateField("receptor_node_count", event.target.value)} />
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.content_signing_enabled} onChange={(event) => updateField("content_signing_enabled", event.target.checked)} />
              <span>Content signing is enabled</span>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.content_signing_expected} onChange={(event) => updateField("content_signing_expected", event.target.checked)} />
              <span>Content signing is required</span>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.gateway_enforced} onChange={(event) => updateField("gateway_enforced", event.target.checked)} />
              <span>Gateway-only component access is expected</span>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.metrics_enabled} onChange={(event) => updateField("metrics_enabled", event.target.checked)} />
              <span>Metrics service or utility is enabled</span>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.automation_reports_enabled} onChange={(event) => updateField("automation_reports_enabled", event.target.checked)} />
              <span>Automation reports are enabled</span>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.ai_assistant_enabled} onChange={(event) => updateField("ai_assistant_enabled", event.target.checked)} />
              <span>AI assistance is enabled</span>
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section__header">
            <h4>Developer portal and API integrations</h4>
            <p>Capture the platform integration points exposed through Backstage plugins, MCP, and related tooling.</p>
          </div>
          <div className="form-grid form-grid--two">
            <label className="checkbox-field">
              <input type="checkbox" checked={form.developer_portal_expected} onChange={(event) => updateField("developer_portal_expected", event.target.checked)} />
              <span>Developer portal registration is expected</span>
            </label>
            <label className="field-group">
              <span className="field-label">Backstage entity reference</span>
              <input className="text-input" value={form.backstage_entity_ref} onChange={(event) => updateField("backstage_entity_ref", event.target.value)} placeholder="component:default/aap-prod-east" />
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.mcp_expected} onChange={(event) => updateField("mcp_expected", event.target.checked)} />
              <span>MCP access is expected</span>
            </label>
            <label className="field-group">
              <span className="field-label">MCP endpoint</span>
              <input className="text-input" value={form.mcp_endpoint} onChange={(event) => updateField("mcp_endpoint", event.target.value)} placeholder="https://aap.example.com/mcp" />
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section__header">
            <h4>Advanced service behavior</h4>
            <p>Override discovered service paths or preserve extra capability flags not modeled by the structured form.</p>
          </div>
          <label className="field-group">
            <span className="field-label">Additional capabilities (JSON)</span>
            <textarea className="text-area text-area--code" rows={5} value={form.extra_capabilities} onChange={(event) => updateField("extra_capabilities", event.target.value)} />
          </label>
          <label className="field-group">
            <span className="field-label">Service path overrides (JSON)</span>
            <textarea className="text-area text-area--code" rows={8} value={form.service_paths} onChange={(event) => updateField("service_paths", event.target.value)} />
          </label>
        </div>

        {localError || errorMessage ? <div className="inline-alert inline-alert--danger">{localError ?? errorMessage}</div> : null}

        <div className="form-actions">
          {showSyncAfterSave ? (
            <label className="checkbox-field">
              <input type="checkbox" checked={syncAfterSave} onChange={(event) => setSyncAfterSave(event.target.checked)} />
              <span>Queue a sync after save</span>
            </label>
          ) : (
            <span className="field-help">Changes are saved immediately to the registration record.</span>
          )}
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Saving..." : submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
