import { FormEvent, useState } from "react";

import {
  Button,
  Checkbox,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Stack,
  StackItem,
  TextArea,
  TextInput,
} from "@patternfly/react-core";

import type { PolicyCreatePayload } from "../types";

type RuleType =
  | "require_version_prefix"
  | "max_sync_age_minutes"
  | "max_failed_jobs"
  | "min_health_score"
  | "component_enabled"
  | "controller_setting"
  | "named_resource_present";

type Props = {
  busy?: boolean;
  onSubmit: (payload: PolicyCreatePayload) => Promise<void> | void;
};

const RULE_OPTIONS: Array<{ value: RuleType; label: string; help: string }> = [
  {
    value: "require_version_prefix",
    label: "AAP version prefix",
    help: "Require the collected platform version to start with a prefix such as 2.5 or 2.7.",
  },
  {
    value: "max_failed_jobs",
    label: "Maximum recent failed jobs",
    help: "Controllers must stay at or below this recent failure count.",
  },
  {
    value: "max_sync_age_minutes",
    label: "Maximum sync age",
    help: "Environments must have synchronized within this many minutes.",
  },
  {
    value: "min_health_score",
    label: "Minimum health score",
    help: "Collected health score must be at least this value (0-100).",
  },
  {
    value: "component_enabled",
    label: "Component must be configured",
    help: "The selected AAP component URL must be present on the environment.",
  },
  {
    value: "controller_setting",
    label: "Controller setting must match",
    help: "A collected AWX/Controller setting such as MAX_FORKS or GALAXY_IGNORE_CERTS must equal the desired value. Enable remediate to PATCH noncompliant controllers.",
  },
  {
    value: "named_resource_present",
    label: "Named resource must exist",
    help: "Require an organization, execution environment, or instance group by name. Remediation can create a missing record.",
  },
];

function parseSettingValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return raw;
}

function buildRule(
  ruleType: RuleType,
  threshold: string,
  prefix: string,
  service: string,
  settingKey: string,
  settingValue: string,
  resourceType: string,
  resourceName: string,
  resourceImage: string,
  remediate: boolean,
): Record<string, unknown> {
  if (ruleType === "require_version_prefix") {
    return { type: ruleType, prefix: prefix.trim() };
  }
  if (ruleType === "component_enabled") {
    return { type: ruleType, service };
  }
  if (ruleType === "controller_setting") {
    return { type: ruleType, key: settingKey.trim(), value: parseSettingValue(settingValue), remediate };
  }
  if (ruleType === "named_resource_present") {
    const create: Record<string, unknown> = { name: resourceName.trim() };
    if (resourceType === "execution_environment" && resourceImage.trim()) {
      create.image = resourceImage.trim();
      create.pull = "missing";
    }
    return { type: ruleType, resource_type: resourceType, name: resourceName.trim(), remediate, create };
  }
  return { type: ruleType, threshold: Number.parseInt(threshold, 10) || 0 };
}

export function PolicyForm({ busy, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<PolicyCreatePayload["severity"]>("medium");
  const [ruleType, setRuleType] = useState<RuleType>("require_version_prefix");
  const [prefix, setPrefix] = useState("2.7");
  const [threshold, setThreshold] = useState("5");
  const [service, setService] = useState("controller");
  const [settingKey, setSettingKey] = useState("GALAXY_IGNORE_CERTS");
  const [settingValue, setSettingValue] = useState("false");
  const [resourceType, setResourceType] = useState("organization");
  const [resourceName, setResourceName] = useState("Default");
  const [resourceImage, setResourceImage] = useState("");
  const [remediate, setRemediate] = useState(true);
  const [tags, setTags] = useState("");
  const [pushToFleet, setPushToFleet] = useState(true);

  const selectedRule = RULE_OPTIONS.find((option) => option.value === ruleType);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const tagList = tags
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      severity,
      enabled: true,
      scope: tagList.length ? { tags: tagList } : {},
      rule: buildRule(
        ruleType,
        threshold,
        prefix,
        service,
        settingKey,
        settingValue,
        resourceType,
        resourceName,
        resourceImage,
        remediate,
      ),
      push_to_fleet: pushToFleet,
    });
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Stack hasGutter>
        <StackItem>
          <FormGroup label="Name" fieldId="policy-name" isRequired>
            <TextInput
              id="policy-name"
              value={name}
              isRequired
              onChange={(_, value) => setName(value)}
              placeholder="Controller failure budget"
            />
          </FormGroup>
        </StackItem>
        <StackItem>
          <FormGroup label="Description" fieldId="policy-description">
            <TextArea
              id="policy-description"
              value={description}
              onChange={(_, value) => setDescription(value)}
              rows={2}
            />
          </FormGroup>
        </StackItem>
        <StackItem>
          <FormGroup label="Severity" fieldId="policy-severity">
            <FormSelect id="policy-severity" value={severity} onChange={(_, value) => setSeverity(value as PolicyCreatePayload["severity"])}>
              <FormSelectOption value="low" label="Low" />
              <FormSelectOption value="medium" label="Medium" />
              <FormSelectOption value="high" label="High" />
              <FormSelectOption value="critical" label="Critical" />
            </FormSelect>
          </FormGroup>
        </StackItem>
        <StackItem>
          <FormGroup label="Rule" fieldId="policy-rule-type">
            <FormSelect id="policy-rule-type" value={ruleType} onChange={(_, value) => setRuleType(value as RuleType)}>
              {RULE_OPTIONS.map((option) => (
                <FormSelectOption key={option.value} value={option.value} label={option.label} />
              ))}
            </FormSelect>
            <p className="aam-form-help">{selectedRule?.help}</p>
          </FormGroup>
        </StackItem>
        {ruleType === "require_version_prefix" ? (
          <StackItem>
            <FormGroup label="Version prefix" fieldId="policy-prefix" isRequired>
              <TextInput id="policy-prefix" value={prefix} onChange={(_, value) => setPrefix(value)} />
            </FormGroup>
          </StackItem>
        ) : null}
        {ruleType === "component_enabled" ? (
          <StackItem>
            <FormGroup label="Component" fieldId="policy-service">
              <FormSelect id="policy-service" value={service} onChange={(_, value) => setService(value)}>
                <FormSelectOption value="controller" label="Controller" />
                <FormSelectOption value="eda" label="EDA" />
                <FormSelectOption value="hub" label="Automation Hub" />
              </FormSelect>
            </FormGroup>
          </StackItem>
        ) : null}
        {ruleType === "controller_setting" ? (
          <>
            <StackItem>
              <FormGroup label="Setting key" fieldId="policy-setting-key" isRequired>
                <TextInput id="policy-setting-key" value={settingKey} onChange={(_, value) => setSettingKey(value)} />
              </FormGroup>
            </StackItem>
            <StackItem>
              <FormGroup label="Desired value" fieldId="policy-setting-value" isRequired>
                <TextInput id="policy-setting-value" value={settingValue} onChange={(_, value) => setSettingValue(value)} />
                <p className="aam-form-help">Use true/false, a number, or JSON. This value is PATCHed onto noncompliant controllers when remediate is enabled.</p>
              </FormGroup>
            </StackItem>
          </>
        ) : null}
        {ruleType === "named_resource_present" ? (
          <>
            <StackItem>
              <FormGroup label="Resource type" fieldId="policy-resource-type">
                <FormSelect id="policy-resource-type" value={resourceType} onChange={(_, value) => setResourceType(value)}>
                  <FormSelectOption value="organization" label="Organization" />
                  <FormSelectOption value="execution_environment" label="Execution environment" />
                  <FormSelectOption value="instance_group" label="Instance group" />
                </FormSelect>
              </FormGroup>
            </StackItem>
            <StackItem>
              <FormGroup label="Name" fieldId="policy-resource-name" isRequired>
                <TextInput id="policy-resource-name" value={resourceName} onChange={(_, value) => setResourceName(value)} />
              </FormGroup>
            </StackItem>
            {resourceType === "execution_environment" ? (
              <StackItem>
                <FormGroup label="Image" fieldId="policy-resource-image">
                  <TextInput
                    id="policy-resource-image"
                    value={resourceImage}
                    onChange={(_, value) => setResourceImage(value)}
                    placeholder="registry.redhat.io/ansible-automation-platform-25/ee-supported-rhel8:latest"
                  />
                </FormGroup>
              </StackItem>
            ) : null}
          </>
        ) : null}
        {ruleType !== "require_version_prefix" &&
        ruleType !== "component_enabled" &&
        ruleType !== "controller_setting" &&
        ruleType !== "named_resource_present" ? (
          <StackItem>
            <FormGroup label="Threshold" fieldId="policy-threshold" isRequired>
              <TextInput id="policy-threshold" type="number" value={threshold} onChange={(_, value) => setThreshold(value)} />
            </FormGroup>
          </StackItem>
        ) : null}
        <StackItem>
          <FormGroup label="Scope tags" fieldId="policy-tags">
            <TextInput
              id="policy-tags"
              value={tags}
              onChange={(_, value) => setTags(value)}
              placeholder="Leave blank to apply to every environment"
            />
            <p className="aam-form-help">Comma-separated environment tags. Empty means all registered AAP instances.</p>
          </FormGroup>
        </StackItem>
        {ruleType === "controller_setting" || ruleType === "named_resource_present" ? (
          <StackItem>
            <Checkbox
              id="policy-remediate"
              label="Allow pushing this configuration onto noncompliant AAP environments"
              description="Creates missing organizations, execution environments, or instance groups, or PATCHes the controller setting. Credentials and secrets are never copied."
              isChecked={remediate}
              onChange={(_, checked) => setRemediate(checked)}
            />
          </StackItem>
        ) : null}
        <StackItem>
          <Checkbox
            id="policy-push"
            label="Evaluate against all matching AAP environments now"
            description="Compare collected fleet state immediately. Use Remediate on the policy card to write configuration onto noncompliant controllers."
            isChecked={pushToFleet}
            onChange={(_, checked) => setPushToFleet(checked)}
          />
        </StackItem>
        <StackItem>
          <Button type="submit" variant="primary" isDisabled={busy || !name.trim()} isLoading={busy}>
            {pushToFleet ? "Create and push" : "Create policy"}
          </Button>
        </StackItem>
      </Stack>
    </Form>
  );
}
