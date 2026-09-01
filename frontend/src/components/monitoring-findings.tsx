import { Alert, Button, Stack, StackItem, Content } from "@patternfly/react-core";

import type { MonitoringFinding } from "../monitoring";
import { LinkButton } from "./link-button";

type Props = {
  findings: MonitoringFinding[];
  showEnvironment?: boolean;
};

export function MonitoringFindings({ findings, showEnvironment = true }: Props) {
  if (findings.length === 0) {
    return null;
  }

  return (
    <Stack hasGutter>
      {findings.map((finding) => (
        <StackItem key={`${finding.environmentId}-${finding.service}-${finding.title}`}>
          <Alert
            isInline
            variant={finding.severity === "critical" ? "danger" : "warning"}
            title={showEnvironment ? `${finding.environmentName}: ${finding.title}` : finding.title}
          >
            <Stack hasGutter>
              <StackItem>
                <Content component="p">
                  <strong>Why: </strong>
                  {finding.reason}
                </Content>
                <Content component="p">
                  <strong>What to do: </strong>
                  {finding.resolution}
                </Content>
              </StackItem>
              <StackItem>
                <div className="aam-finding-actions">
                  <LinkButton to={finding.href} variant="secondary" size="sm">
                    {finding.hrefLabel}
                  </LinkButton>
                </div>
              </StackItem>
            </Stack>
          </Alert>
        </StackItem>
      ))}
    </Stack>
  );
}

type EmptyHealthyProps = {
  onSync?: () => void;
  syncBusy?: boolean;
};

export function MonitoringHealthyState({ onSync, syncBusy }: EmptyHealthyProps) {
  return (
    <Content component="p" className="aam-muted">
      No service warnings on the latest sync. Gateway, controller, EDA, and Hub are healthy or intentionally not configured.
      {onSync ? (
        <>
          {" "}
          <Button variant="link" isInline isDisabled={syncBusy} onClick={onSync}>
            Sync again
          </Button>
        </>
      ) : null}
    </Content>
  );
}
