import { FormEvent, useEffect, useState } from "react";

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
  capabilities: string;
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
    capabilities: initialValue ? toPrettyJson(initialValue.capabilities) : emptyJson,
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
        capabilities: parseObjectField(form.capabilities, "Capabilities"),
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
            <h4>Advanced service behavior</h4>
            <p>Override discovered capabilities or service paths when the remote AAP deployment differs from defaults.</p>
          </div>
          <label className="field-group">
            <span className="field-label">Capabilities (JSON)</span>
            <textarea className="text-area text-area--code" rows={5} value={form.capabilities} onChange={(event) => updateField("capabilities", event.target.value)} />
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
