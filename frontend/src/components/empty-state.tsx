import type { ComponentType, ReactNode } from "react";

import {
  EmptyState as PatternFlyEmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateHeader,
  EmptyStateIcon,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";

type Props = {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ComponentType<any>;
  variant?: "xs" | "sm" | "lg" | "xl" | "full";
};

export function EmptyState({ title, description, action, icon = CubesIcon, variant = "lg" }: Props) {
  return (
    <PatternFlyEmptyState variant={variant}>
      <EmptyStateHeader titleText={title} headingLevel="h3" icon={<EmptyStateIcon icon={icon} />} />
      <EmptyStateBody>{description}</EmptyStateBody>
      {action ? (
        <EmptyStateFooter>
          <EmptyStateActions>{action}</EmptyStateActions>
        </EmptyStateFooter>
      ) : null}
    </PatternFlyEmptyState>
  );
}
