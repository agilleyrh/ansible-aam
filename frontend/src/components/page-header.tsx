import type { ReactNode } from "react";

import { Flex, FlexItem, Text, Title } from "@patternfly/react-core";

type Props = {
  section: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageHeader({ section, title, description, actions }: Props) {
  return (
    <Flex
      className="aam-page-header"
      alignItems={{ default: "alignItemsFlexStart" }}
      justifyContent={{ default: "justifyContentSpaceBetween" }}
      flexWrap={{ default: "wrap" }}
      gap={{ default: "gapMd" }}
    >
      <FlexItem flex={{ default: "flex_1" }}>
        <Text component="small" className="aam-page-header__section">
          {section}
        </Text>
        <Title headingLevel="h1" size="2xl">
          {title}
        </Title>
        <Text component="p" className="aam-page-header__description">
          {description}
        </Text>
      </FlexItem>
      {actions ? (
        <FlexItem>
          <Flex flexWrap={{ default: "wrap" }} gap={{ default: "gapSm" }}>
            {actions}
          </Flex>
        </FlexItem>
      ) : null}
    </Flex>
  );
}
