import { Card, CardBody, Stack, StackItem, Text, Title } from "@patternfly/react-core";

type Props = {
  label: string;
  value: string | number;
  detail?: string;
};

export function StatCard({ label, value, detail }: Props) {
  return (
    <Card isFlat isFullHeight>
      <CardBody>
        <Stack hasGutter>
          <StackItem>
            <Text component="small" className="aam-stat-card__label">
              {label}
            </Text>
          </StackItem>
          <StackItem>
            <Title headingLevel="h3" size="2xl">
              {value}
            </Title>
          </StackItem>
          {detail ? (
            <StackItem>
              <Text component="small" className="aam-muted">
                {detail}
              </Text>
            </StackItem>
          ) : null}
        </Stack>
      </CardBody>
    </Card>
  );
}
