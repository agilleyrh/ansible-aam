import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Label,
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
import { BellIcon } from "@patternfly/react-icons";
import { Link as RouterLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import { AnsibleLogo } from "./ansible-logo";
import { ColorModeToggle } from "./color-mode-toggle";
import { api } from "../api";
import { useAuth } from "../auth";
import type { FleetAlert } from "../types";

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertError, setAlertError] = useState("");
  const isSystemAdmin = user?.system_roles?.includes("admin") ?? false;
  const canManageAccess =
    isSystemAdmin ||
    Object.values(user?.environment_roles ?? {}).some((roles) => roles.includes("environment-admin"));
  const links = [
    { to: "/", label: "Overview" },
    { to: "/monitoring", label: "Monitoring" },
    { to: "/jobs", label: "Jobs" },
    { to: "/environments", label: "Environments" },
    { to: "/activity", label: "Activity" },
    { to: "/policies", label: "Governance" },
    { to: "/topology", label: "Topology" },
    { to: "/search", label: "Search" },
    { to: "/account", label: "Account" },
    ...(canManageAccess ? [{ to: "/access", label: "Access" }] : []),
    ...(isSystemAdmin ? [{ to: "/settings", label: "Administration" }] : []),
  ];

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .alerts(true)
        .then((items) => {
          if (!cancelled) {
            setAlerts(items);
            setAlertError("");
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setAlertError(err instanceof Error ? err.message : "Alerts could not be loaded.");
          }
        });
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  function isActivePath(path: string) {
    return path === "/" ? location.pathname === path : location.pathname === path || location.pathname.startsWith(`${path}/`);
  }

  const openAlerts = alerts.filter((alert) => !alert.acknowledged_at && !alert.resolved_at);
  const closedAlerts = alerts.filter((alert) => alert.acknowledged_at || alert.resolved_at);

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
        <div className="aam-masthead-actions">
          <span className="aam-masthead-user">{user?.username}</span>
          {user?.system_roles?.includes("admin") ? <Label color="blue">Administrator</Label> : null}
          <Button
            variant="link"
            onClick={() => {
              logout().then(() => navigate("/login"));
            }}
          >
            Log out
          </Button>
          <div className="aam-alerts">
            <Button
              variant="plain"
              aria-label={openAlerts.length ? `${openAlerts.length} critical alerts` : "No critical alerts"}
              onClick={() => setAlertsOpen((open) => !open)}
            >
              <BellIcon />
              {openAlerts.length ? <span className="aam-alerts__count">{openAlerts.length}</span> : null}
            </Button>
            {alertsOpen ? (
              <div className="aam-alerts__panel" role="dialog" aria-label="Critical alerts">
                <Title headingLevel="h2" size="md">
                  Critical alerts
                </Title>
                {alertError ? <p className="aam-muted">{alertError}</p> : null}
                {openAlerts.length === 0 ? (
                  <p className="aam-muted">No open critical alerts.</p>
                ) : (
                  <ul className="aam-alerts__list">
                    {openAlerts.map((alert) => (
                      <li key={alert.id}>
                        <RouterLink to={`/environments/${alert.environment_id}`} onClick={() => setAlertsOpen(false)}>
                          {alert.environment_name}
                        </RouterLink>
                        <p>{alert.message}</p>
                        <Button
                          variant="link"
                          isInline
                          onClick={() => {
                            setAlertError("");
                            api
                              .acknowledgeAlert(alert.id)
                              .then(() =>
                                setAlerts((current) =>
                                  current.map((item) =>
                                    item.id === alert.id ? { ...item, acknowledged_at: new Date().toISOString() } : item,
                                  ),
                                ),
                              )
                              .catch((err: unknown) =>
                                setAlertError(err instanceof Error ? err.message : "The alert could not be dismissed."),
                              );
                          }}
                        >
                          Dismiss
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {closedAlerts.length ? (
                  <>
                    <Title headingLevel="h3" size="md">
                      Recent
                    </Title>
                    <ul className="aam-alerts__list">
                      {closedAlerts.slice(0, 6).map((alert) => (
                        <li key={alert.id}>
                          <RouterLink to={`/environments/${alert.environment_id}`} onClick={() => setAlertsOpen(false)}>
                            {alert.environment_name}
                          </RouterLink>
                          <p>
                            {alert.resolved_at ? "Recovered" : "Dismissed"} · {alert.message}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <ColorModeToggle />
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
                  Register AAP and Automation Orchestrator environments across Podman, OpenShift, and cloud footprints. Monitor health, review live jobs and executions, and act from one control hub.
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
