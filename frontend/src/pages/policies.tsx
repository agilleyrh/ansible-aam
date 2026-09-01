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
import type { Policy, PolicyCreatePayload, PolicyPushResult, PolicyResult } from "../types";
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

function pushSummary(result: PolicyPushResult): string {
  return `Evaluated ${result.evaluated} of ${result.environments} environments — ${result.compliant} compliant, ${result.noncompliant} noncompliant.`;
}

export function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [results, setResults] = useState<PolicyResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  async function reload(signal?: AbortSignal) {
    const [policyList, resultList] = await Promise.all([api.policies(signal), api.policyResults(signal)]);
    if (!signal?.aborted) {
      setPolicies(policyList);
      setResults(resultList);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api.policies(controller.signal),
      api.policyResults(controller.signal),
      api.me(controller.signal),
    ]).then(([policiesResult, resultsResult, meResult]) => {
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
      await reload();
      setMessage(`${policy.name}: ${pushSummary(result)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to push the policy.");
    } finally {
      setPushingId(null);
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
          description="Create hub policies as an administrator, push them to every matching AAP environment, and review the latest compliance outcomes."
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
                        <Button
                          variant="secondary"
                          size="sm"
                          isDisabled={!policy.enabled || pushingId === policy.id}
                          isLoading={pushingId === policy.id}
                          onClick={() => {
                            void pushPolicy(policy);
                          }}
                        >
                          Push to fleet
                        </Button>
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
                      Recent compliance outcomes across every managed environment.
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
    </Stack>
  );
}
