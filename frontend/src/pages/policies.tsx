import { useEffect, useState } from "react";

import {
  Alert,
  Bullseye,
  Card,
  CardBody,
  CardHeader,
  CodeBlock,
  CodeBlockCode,
  Gallery,
  Grid,
  GridItem,
  Label,
  Stack,
  StackItem,
  Text,
  Title,
} from "@patternfly/react-core";

import { api } from "../api";
import { EmptyState } from "../components/empty-state";
import { LinkButton } from "../components/link-button";
import { PageHeader } from "../components/page-header";
import { StatusPill } from "../components/status-pill";
import type { Policy, PolicyResult } from "../types";
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

export function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [results, setResults] = useState<PolicyResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([api.policies(controller.signal), api.policyResults(controller.signal)])
      .then(([policiesResult, resultsResult]) => {
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
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  if (error && policies.length === 0) {
    return <Alert isInline variant="danger" title={`Governance unavailable: ${error}`} />;
  }

  return (
    <Stack hasGutter>
      <StackItem>
        <PageHeader
          section="Governance"
          title="Fleet policies and compliance results"
          description="Review policy definitions, severity, and the latest compliance outcomes reported by the scheduler and sync worker."
        />
      </StackItem>

      {loading ? (
        <StackItem>
          <Bullseye>
            <Card isFlat>
              <CardBody>Loading policies...</CardBody>
            </Card>
          </Bullseye>
        </StackItem>
      ) : policies.length === 0 ? (
        <StackItem>
          <Card isFlat>
            <CardBody>
              <EmptyState
                title="No governance policies available"
                description="Once the backend seeds or creates policies, they will appear here with fleet evaluation results."
              />
            </CardBody>
          </Card>
        </StackItem>
      ) : (
        <StackItem>
          <Gallery hasGutter minWidths={{ default: "320px" }}>
            {policies.map((policy) => (
              <Card key={policy.id} isFlat isFullHeight>
                <CardHeader>
                  <Stack hasGutter>
                    <StackItem>
                      <Title headingLevel="h2" size="lg">
                        {policy.name}
                      </Title>
                    </StackItem>
                    <StackItem>
                      <Text component="p" className="aam-muted">
                        {policy.description}
                      </Text>
                    </StackItem>
                    <StackItem>
                      <Label color={severityColor(policy.severity)}>{policy.severity}</Label>
                    </StackItem>
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
        <Card isFlat>
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
                    <Text component="p" className="aam-muted">
                      Recent compliance outcomes across every managed environment.
                    </Text>
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
              <Text component="p" className="aam-muted">
                Loading results...
              </Text>
            ) : results.length === 0 ? (
              <EmptyState
                title="No policy results yet"
                description="Queue environment syncs to evaluate policies against collected service posture and inventory."
              />
            ) : (
              <Stack hasGutter>
                {results.map((result) => {
                  const policy = policies.find((entry) => entry.id === result.policy_id);
                  return (
                    <Card key={result.id} isFlat isCompact>
                      <CardBody>
                        <Grid hasGutter>
                          <GridItem md={3}>
                            <Text component="small" className="aam-muted">
                              Policy
                            </Text>
                            <div>{policy?.name ?? result.policy_id}</div>
                          </GridItem>
                          <GridItem md={2}>
                            <Text component="small" className="aam-muted">
                              Status
                            </Text>
                            <div>
                              <StatusPill status={result.compliance} />
                            </div>
                          </GridItem>
                          <GridItem md={5}>
                            <Text component="small" className="aam-muted">
                              Message
                            </Text>
                            <div>{result.message}</div>
                          </GridItem>
                          <GridItem md={2}>
                            <Text component="small" className="aam-muted">
                              Evaluated
                            </Text>
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
    </Stack>
  );
}
