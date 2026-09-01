import { useEffect, useState } from "react";

import {
  Alert,
  Bullseye,
  Button,
  Card,
  CardBody,
  CardHeader,
  CodeBlock,
  CodeBlockCode,
  Gallery,
  Grid,
  GridItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
  Switch,
  Content,
  Title,
} from "@patternfly/react-core";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { LinkButton } from "../components/link-button";
import { PageHeader } from "../components/page-header";
import { PolicyForm } from "../components/policy-form";
import { StatusPill } from "../components/status-pill";
import type { ConfigBaseline, Policy, PolicyCreatePayload, PolicyPushResult, PolicyRemediateResult, PolicyResult } from "../types";
import { formatDateTime } from "../utils";

function severityColor(severity: string): "red" | "orange" | "blue" | "grey" {
  const normalized = severity.toLowerCase();
  if (normalized === "critical" || normalized === "high") {
    return "red";
  }
  if (normalized === "medium" || normalized === "warning") {
    return "orange";
  }
  if (normalized === "low") {
    return "blue";
  }
  return "grey";
}

function isAdmin(roles: string[]): boolean {
  return roles.some((role) => role === "aam.admin" || role === "platform-admin");
}

function isRemediable(rule: Record<string, unknown>): boolean {
  return Boolean(rule.remediate) && (rule.type === "controller_setting" || rule.type === "named_resource_present");
}

function remediateSummary(result: PolicyRemediateResult): string {
  return `Wrote configuration to ${result.applied} environment(s), ${result.failed} failed, ${result.skipped} skipped. Now ${result.compliant} compliant, ${result.noncompliant} noncompliant.`;
}

function pushSummary(result: PolicyPushResult): string {
  return `Queried ${result.environments} environment(s) live — ${result.compliant} compliant, ${result.noncompliant} noncompliant, ${result.unknown} unknown, ${result.skipped} skipped.`;
}

type EvaluationSummary = {
  policyName: string;
  result: PolicyPushResult;
  kind: "evaluate" | "remediate";
};

function evaluationVariant(result: PolicyPushResult): "success" | "warning" | "danger" | "info" {
  if (result.noncompliant > 0) {
    return "danger";
  }
  if (result.unknown > 0 || result.skipped > 0 || result.environments === 0) {
    return "warning";
  }
  if (result.compliant > 0) {
    return "success";
  }
  return "info";
}

export function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [results, setResults] = useState<PolicyResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [remediatingId, setRemediatingId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [baseline, setBaseline] = useState<ConfigBaseline | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationSummary | null>(null);

  async function reload(signal?: AbortSignal) {
    const [policyList, resultList, baselineResult] = await Promise.all([
      api.policies(signal),
      api.policyResults(signal),
      api.configBaseline(signal),
    ]);
    if (!signal?.aborted) {
      setPolicies(policyList);
      setResults(resultList);
      setBaseline(baselineResult);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api.policies(controller.signal),
      api.policyResults(controller.signal),
      api.configBaseline(controller.signal),
      api.me(controller.signal),
    ]).then(([policiesResult, resultsResult, baselineResult, meResult]) => {
      if (controller.signal.aborted) {
        return;
      }
      if (policiesResult.status === "fulfilled") {
        setPolicies(policiesResult.value);
      } else {
        setError(policiesResult.reason?.message ?? "Failed to load policies");
      }
      if (resultsResult.status === "fulfilled") {
        setResults(resultsResult.value);
      }
      if (baselineResult.status === "fulfilled") {
        setBaseline(baselineResult.value);
      }
      if (meResult.status === "fulfilled") {
        setCanManage(isAdmin(meResult.value.roles));
      }
    }).finally(() => {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, []);

  async function togglePolicy(policy: Policy, enabled: boolean) {
    setUpdatingId(policy.id);
    setError(null);
    try {
      const updated = await api.updatePolicy(policy.id, { enabled });
      setPolicies((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update the policy.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function pushPolicy(policy: Policy) {
    setPushingId(policy.id);
    setError(null);
    setMessage(null);
    try {
      const result = await api.pushPolicy(policy.id);
      setEvaluation({ policyName: policy.name, result, kind: "evaluate" });
      setMessage(`${policy.name}: ${pushSummary(result)}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to evaluate the policy.");
    } finally {
      setPushingId(null);
    }
  }

  async function remediatePolicy(policy: Policy) {
    setRemediatingId(policy.id);
    setError(null);
    setMessage(null);
    try {
      const result = await api.remediatePolicy(policy.id);
      setEvaluation({ policyName: policy.name, result, kind: "remediate" });
      setMessage(`${policy.name}: ${remediateSummary(result)}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to push configuration.");
    } finally {
      setRemediatingId(null);
    }
  }

  async function createPolicy(payload: PolicyCreatePayload) {
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const created = await api.createPolicy(payload);
      setIsCreateOpen(false);
      await reload();
      setMessage(
        payload.push_to_fleet
          ? `Created ${created.name} and evaluated it against all matching environments.`
          : `Created ${created.name}. Enable and push it when you are ready.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the policy.");
    } finally {
      setCreating(false);
    }
  }

  if (error && policies.length === 0) {
    return <Alert isInline variant="danger" title={`Governance unavailable: ${error}`} />;
  }

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Governance"
          title="Fleet policies and compliance results"
          description="Compare controller settings, organizations, execution environments, and instance groups across the fleet. Admins can create policies and push missing or drifted configuration onto noncompliant AAP environments."
          actions={
            canManage ? (
              <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                Create policy
              </Button>
            ) : undefined
          }
        />
      </StackItem>

      {message ? (
        <StackItem>
          <Alert isInline variant="success" title={message} />
        </StackItem>
      ) : null}
      {error ? (
        <StackItem>
          <Alert isInline variant="danger" title={error} />
        </StackItem>
      ) : null}

      {baseline ? (
        <StackItem>
          <Card>
            <CardHeader>
              <Title headingLevel="h2" size="lg">
                Fleet configuration drift
              </Title>
            </CardHeader>
            <CardBody>
              {baseline.environments.length === 0 ? (
                <Content component="p" className="aam-muted">
                  Register and sync AAP environments to compare controller settings and named resources.
                </Content>
              ) : baseline.drift.length === 0 ? (
                <Content component="p">
                  Collected controller settings, organizations, execution environments, and instance groups match across {baseline.environments.length} environment(s).
                </Content>
              ) : (
                <Stack hasGutter>
                  <StackItem>
                    <Content component="p" className="aam-muted">
                      These values differ across registered AAP environments. Create a remediable policy to push the desired setting or missing resource.
                    </Content>
                  </StackItem>
                  {baseline.drift.map((item) => (
                    <Card key={`${item.kind}-${item.name}`} isCompact>
                      <CardBody>
                        <Grid hasGutter>
                          <GridItem md={3}>
                            <Content component="small" className="aam-muted">
                              {item.kind}
                            </Content>
                            <div>{item.name}</div>
                          </GridItem>
                          <GridItem md={9}>
                            <div className="aam-link-cluster">
                              {Object.entries(item.values).map(([environmentName, value]) => (
                                <Label key={`${item.kind}-${item.name}-${environmentName}`} isCompact>
                                  {environmentName}: {typeof value === "string" ? value : JSON.stringify(value)}
                                </Label>
                              ))}
                            </div>
                          </GridItem>
                        </Grid>
                      </CardBody>
                    </Card>
                  ))}
                </Stack>
              )}
            </CardBody>
          </Card>
        </StackItem>
      ) : null}

      {loading ? (
        <StackItem>
          <Bullseye>
            <Card>
              <CardBody>Loading policies...</CardBody>
            </Card>
          </Bullseye>
        </StackItem>
      ) : policies.length === 0 ? (
        <StackItem>
          <Card>
            <CardBody>
              <EmptyState
                title="No governance policies available"
                description="Administrators can create a policy and push it to all registered AAP environments."
              />
            </CardBody>
          </Card>
        </StackItem>
      ) : (
        <StackItem>
          <Gallery hasGutter minWidths={{ default: "320px" }}>
            {policies.map((policy) => (
              <Card key={policy.id}>
                <CardHeader>
                  <Stack hasGutter>
                    <StackItem>
                      <Title headingLevel="h2" size="lg">
                        {policy.name}
                      </Title>
                    </StackItem>
                    <StackItem>
                      <Content component="p" className="aam-muted">
                        {policy.description}
                      </Content>
                    </StackItem>
                    <StackItem>
                      <Label color={severityColor(policy.severity)}>{policy.severity}</Label>
                    </StackItem>
                    <StackItem>
                      <Switch
                        id={`policy-enabled-${policy.id}`}
                        label={policy.enabled ? "Enabled" : "Disabled"}
                        isChecked={policy.enabled}
                        isDisabled={!canManage || updatingId === policy.id}
                        onChange={(_, checked) => {
                          void togglePolicy(policy, checked);
                        }}
                      />
                    </StackItem>
                    {canManage ? (
                      <StackItem>
                        <div className="aam-link-cluster">
                          <Button
                            variant="secondary"
                            size="sm"
                            isDisabled={!policy.enabled || pushingId === policy.id}
                            isLoading={pushingId === policy.id}
                            onClick={() => {
                              void pushPolicy(policy);
                            }}
                          >
                            Evaluate fleet
                          </Button>
                          {isRemediable(policy.rule) ? (
                            <Button
                              variant="primary"
                              size="sm"
                              isDisabled={!policy.enabled || remediatingId === policy.id}
                              isLoading={remediatingId === policy.id}
                              onClick={() => {
                                void remediatePolicy(policy);
                              }}
                            >
                              Remediate noncompliant
                            </Button>
                          ) : null}
                        </div>
                      </StackItem>
                    ) : null}
                  </Stack>
                </CardHeader>
                <CardBody>
                  <CodeBlock className="aam-code-block">
                    <CodeBlockCode>{JSON.stringify(policy.rule, null, 2)}</CodeBlockCode>
                  </CodeBlock>
                </CardBody>
              </Card>
            ))}
          </Gallery>
        </StackItem>
      )}

      <StackItem>
        <Card>
          <CardHeader>
            <Grid hasGutter style={{ width: "100%" }}>
              <GridItem md={8}>
                <Stack>
                  <StackItem>
                    <Title headingLevel="h2" size="lg">
                      Latest evaluations
                    </Title>
                  </StackItem>
                  <StackItem>
                    <Content component="p" className="aam-muted">
                      Recent compliance outcomes. Evaluate fleet queries each AAP controller live, then records the result below.
                    </Content>
                  </StackItem>
                </Stack>
              </GridItem>
              <GridItem md={4} style={{ textAlign: "right" }}>
                <LinkButton to="/environments" variant="secondary">
                  Open environment registry
                </LinkButton>
              </GridItem>
            </Grid>
          </CardHeader>
          <CardBody>
            {loading ? (
              <Content component="p" className="aam-muted">
                Loading results...
              </Content>
            ) : results.length === 0 ? (
              <EmptyState
                title="No policy results yet"
                description="Create a policy and push it, or queue environment syncs, to evaluate fleet posture."
              />
            ) : (
              <Stack hasGutter>
                {results.map((result) => {
                  const policy = policies.find((entry) => entry.id === result.policy_id);
                  return (
                    <Card key={result.id} isCompact>
                      <CardBody>
                        <Grid hasGutter>
                          <GridItem md={3}>
                            <Content component="small" className="aam-muted">
                              Policy
                            </Content>
                            <div>{policy?.name ?? result.policy_id}</div>
                          </GridItem>
                          <GridItem md={2}>
                            <Content component="small" className="aam-muted">
                              Environment
                            </Content>
                            <div>
                              {result.environment_name ? (
                                <LinkButton to={`/environments/${result.environment_id}`} variant="link" isInline>
                                  {result.environment_name}
                                </LinkButton>
                              ) : (
                                result.environment_id
                              )}
                            </div>
                          </GridItem>
                          <GridItem md={2}>
                            <Content component="small" className="aam-muted">
                              Status
                            </Content>
                            <div>
                              <StatusPill status={result.compliance} />
                            </div>
                          </GridItem>
                          <GridItem md={3}>
                            <Content component="small" className="aam-muted">
                              Message
                            </Content>
                            <div>{result.message}</div>
                          </GridItem>
                          <GridItem md={2}>
                            <Content component="small" className="aam-muted">
                              Evaluated
                            </Content>
                            <div>{formatDateTime(result.evaluated_at)}</div>
                          </GridItem>
                        </Grid>
                      </CardBody>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </CardBody>
        </Card>
      </StackItem>

      <Modal
        variant="medium"
        isOpen={isCreateOpen}
        onClose={() => {
          if (!creating) {
            setIsCreateOpen(false);
          }
        }}
        aria-labelledby="create-policy-title"
      >
        <ModalHeader title="Create fleet policy" labelId="create-policy-title" />
        <ModalBody>
          <PolicyForm busy={creating} onSubmit={createPolicy} />
        </ModalBody>
      </Modal>

      <Modal
        variant="medium"
        isOpen={evaluation !== null}
        onClose={() => setEvaluation(null)}
        aria-labelledby="fleet-evaluation-title"
      >
        <ModalHeader
          title={evaluation?.kind === "remediate" ? "Remediation results" : "Fleet evaluation results"}
          labelId="fleet-evaluation-title"
        />
        <ModalBody>
          {evaluation ? (
            <Stack hasGutter>
              <StackItem>
                <Alert
                  isInline
                  variant={evaluationVariant(evaluation.result)}
                  title={`${evaluation.policyName}: ${evaluation.kind === "remediate" ? remediateSummary(evaluation.result as PolicyRemediateResult) : pushSummary(evaluation.result)}`}
                />
              </StackItem>
              {evaluation.result.checks?.length ? (
                evaluation.result.checks.map((check) => (
                  <Card key={check.environment_id} isCompact>
                    <CardBody>
                      <Grid hasGutter>
                        <GridItem md={4}>
                          <Content component="small" className="aam-muted">
                            Environment
                          </Content>
                          <div>
                            <LinkButton to={`/environments/${check.environment_id}`} variant="link" isInline>
                              {check.environment_name}
                            </LinkButton>
                          </div>
                        </GridItem>
                        <GridItem md={3}>
                          <Content component="small" className="aam-muted">
                            Status
                          </Content>
                          <div>
                            <StatusPill status={check.compliance} />
                          </div>
                        </GridItem>
                        <GridItem md={5}>
                          <Content component="small" className="aam-muted">
                            Finding
                          </Content>
                          <div>{check.message}</div>
                        </GridItem>
                      </Grid>
                    </CardBody>
                  </Card>
                ))
              ) : (
                <StackItem>
                  <Content component="p">
                    No registered AAP environments were available to check. Add an environment, then evaluate again.
                  </Content>
                </StackItem>
              )}
            </Stack>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={() => setEvaluation(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </Stack>
  );
}
