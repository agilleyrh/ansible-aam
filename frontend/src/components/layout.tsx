import {
  Card,
  CardBody,
  CardHeader,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadMain,
  Nav,
  NavItem,
  NavList,
  Page,
  PageSection,
  PageSectionVariants,
  PageSidebar,
  PageSidebarBody,
  Stack,
  StackItem,
  Text,
  Title,
} from "@patternfly/react-core";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";

import { LinkButton } from "./link-button";

const links = [
  { to: "/", label: "Overview" },
  { to: "/monitoring", label: "Monitoring" },
  { to: "/environments", label: "Environments" },
  { to: "/activity", label: "Activity" },
  { to: "/policies", label: "Governance" },
  { to: "/topology", label: "Topology" },
  { to: "/search", label: "Search" },
  { to: "/settings", label: "Administration" },
];

const quickLinks = [
  { to: "/monitoring", label: "Monitoring" },
  { to: "/environments", label: "Environment registry" },
  { to: "/activity", label: "Activity stream" },
  { to: "/settings", label: "Administration" },
];

export function AppLayout() {
  const location = useLocation();

  function isActivePath(path: string) {
    return path === "/" ? location.pathname === path : location.pathname === path || location.pathname.startsWith(`${path}/`);
  }

  const header = (
    <Masthead backgroundColor="dark">
      <MastheadMain>
        <MastheadBrand component="a" href="/">
          <div className="aam-brand">
            <div className="aam-brand__mark">A</div>
            <div>
              <Text component="small" className="aam-brand__eyebrow">
                Red Hat Ansible Automation Platform
              </Text>
              <Title headingLevel="h1" size="lg" className="aam-brand__title">
                Advanced Automation Manager
              </Title>
            </div>
          </div>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <div className="aam-masthead-links">
          {quickLinks.map((link) => (
            <LinkButton key={link.to} to={link.to} variant={isActivePath(link.to) ? "primary" : "secondary"} size="sm">
              {link.label}
            </LinkButton>
          ))}
        </div>
      </MastheadContent>
    </Masthead>
  );

  const sidebar = (
    <PageSidebar theme="light" isSidebarOpen>
      <PageSidebarBody usePageInsets isFilled>
        <Stack hasGutter>
          <StackItem>
            <Nav aria-label="Main navigation" theme="light">
              <NavList>
                {links.map((link) => (
                  <NavItem key={link.to} to={link.to} isActive={isActivePath(link.to)} itemId={link.to}>
                    <RouterLink to={link.to}>{link.label}</RouterLink>
                  </NavItem>
                ))}
              </NavList>
            </Nav>
          </StackItem>
          <StackItem isFilled>
            <Card isFlat isCompact className="aam-sidebar-card">
              <CardHeader>
                <Title headingLevel="h2" size="md">
                  Operating model
                </Title>
              </CardHeader>
              <CardBody>
                <Text component="p">
                  Register AAP environments, validate service health, run inventory syncs, and review governance results from one control hub.
                </Text>
              </CardBody>
            </Card>
          </StackItem>
        </Stack>
      </PageSidebarBody>
    </PageSidebar>
  );

  return (
    <Page header={header} sidebar={sidebar} mainAriaLabel="Advanced Automation Manager">
      <PageSection variant={PageSectionVariants.light} isFilled>
        <div className="aam-page-stack">
          <Outlet />
        </div>
      </PageSection>
    </Page>
  );
}
