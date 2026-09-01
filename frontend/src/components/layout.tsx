import {
  Card,
  CardBody,
  CardHeader,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  Nav,
  NavItem,
  NavList,
  Page,
  PageSection,
  PageSidebar,
  PageSidebarBody,
  Stack,
  StackItem,
  Content,
  Title,
} from "@patternfly/react-core";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";

import { AnsibleLogo } from "./ansible-logo";
import { LinkButton } from "./link-button";

const links = [
  { to: "/", label: "Overview" },
  { to: "/monitoring", label: "Monitoring" },
  { to: "/jobs", label: "Jobs" },
  { to: "/environments", label: "Environments" },
  { to: "/activity", label: "Activity" },
  { to: "/policies", label: "Governance" },
  { to: "/topology", label: "Topology" },
  { to: "/search", label: "Search" },
  { to: "/settings", label: "Administration" },
];

const quickLinks = [
  { to: "/jobs", label: "Fleet jobs" },
  { to: "/monitoring", label: "Monitoring" },
  { to: "/environments", label: "Environment registry" },
  { to: "/settings", label: "Administration" },
];

export function AppLayout() {
  const location = useLocation();

  function isActivePath(path: string) {
    return path === "/" ? location.pathname === path : location.pathname === path || location.pathname.startsWith(`${path}/`);
  }

  const header = (
    <Masthead>
      <MastheadMain>
        <MastheadBrand>
          <MastheadLogo component={(props) => <RouterLink {...props} to="/" />}>
            <div className="aam-brand">
              <div className="aam-brand__mark">
                <AnsibleLogo />
              </div>
              <div>
                <Title headingLevel="h1" size="md" className="aam-brand__title">
                  Advanced Automation Manager
                </Title>
              </div>
            </div>
          </MastheadLogo>
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
    <PageSidebar isSidebarOpen>
      <PageSidebarBody usePageInsets isFilled>
        <Stack hasGutter>
          <StackItem>
            <Nav aria-label="Main navigation">
              <NavList>
                {links.map((link) => (
                  <NavItem key={link.to} itemId={link.to} isActive={isActivePath(link.to)}>
                    <RouterLink to={link.to}>{link.label}</RouterLink>
                  </NavItem>
                ))}
              </NavList>
            </Nav>
          </StackItem>
          <StackItem isFilled>
            <Card isCompact className="aam-sidebar-card">
              <CardHeader>
                <Title headingLevel="h2" size="md">
                  Operating model
                </Title>
              </CardHeader>
              <CardBody>
                <Content component="p">
                  Register AAP environments across Podman, OpenShift, and cloud footprints. Monitor health, review live jobs, and act from one control hub.
                </Content>
              </CardBody>
            </Card>
          </StackItem>
        </Stack>
      </PageSidebarBody>
    </PageSidebar>
  );

  return (
    <Page masthead={header} sidebar={sidebar} mainAriaLabel="Advanced Automation Manager">
      <PageSection hasBodyWrapper={false} isFilled>
        <div className="aam-page-stack">
          <Outlet />
        </div>
      </PageSection>
    </Page>
  );
}
