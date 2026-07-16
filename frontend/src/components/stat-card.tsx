import { Card, CardBody, Stack, StackItem, Content, Title } from "@patternfly/react-core";

type Props = {
  label: string;
  value: string | number;
  detail?: string;
};

export function StatCard({ label, value, detail }: Props) {
  return (
    <Card  isFullHeight>
      <CardBody>
        <Stack hasGutter>
          <StackItem>
            <Content component="small" className="aam-stat-card__label">
              {label}
            </Content>
          </StackItem>
          <StackItem>
            <Title headingLevel="h3" size="2xl">
              {value}
            </Title>
          </StackItem>
          {detail ? (
            <StackItem>
              <Content component="small" className="aam-muted">
                {detail}
              </Content>
            </StackItem>
          ) : null}
        </Stack>
      </CardBody>
    </Card>
  );
}
