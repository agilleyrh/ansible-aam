import { Progress, Stack, StackItem } from "@patternfly/react-core";

type MetricBarItem = {
  label: string;
  value: number;
  total?: number;
  valueText?: string;
  variant?: "danger" | "success" | "warning" | undefined;
};

type Props = {
  items: MetricBarItem[];
  emptyText?: string;
};

export function MetricBarChart({ items, emptyText = "No metrics available." }: Props) {
  if (items.length === 0) {
    return <div className="aam-muted">{emptyText}</div>;
  }

  const maxValue = Math.max(...items.map((item) => item.total ?? item.value), 1);

  return (
    <Stack hasGutter>
      {items.map((item) => {
        const denominator = Math.max(item.total ?? maxValue, 1);
        const value = Math.max(0, Math.min((item.value / denominator) * 100, 100));

        return (
          <StackItem key={item.label}>
            <Progress
              title={item.label}
              value={Number.isFinite(value) ? value : 0}
              label={item.value.toLocaleString()}
              valueText={item.valueText ?? item.value.toLocaleString()}
              measureLocation="outside"
              variant={item.variant}
            />
          </StackItem>
        );
      })}
    </Stack>
  );
}
