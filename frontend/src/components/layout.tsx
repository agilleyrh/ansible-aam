import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownList,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MenuToggle,
  Nav,
  NavItem,
  NavList,
  Page,
  PageSection,
  PageSidebar,
  PageSidebarBody,
  Title,
} from "@patternfly/react-core";
import { BalanceScaleIcon, BellIcon, CogIcon, CubesIcon, HeartbeatIcon, PlayIcon, TachometerAltIcon } from "@patternfly/react-icons";
import { Link as RouterLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";

import { AapLogo } from "./aap-logo";
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const links: Array<{ to: string; label: string; icon: ReactNode; matches: string[] }> = [
    { to: "/", label: "Overview", icon: <TachometerAltIcon />, matches: ["/"] },
    { to: "/environments", label: "Environments", icon: <CubesIcon />, matches: ["/environments"] },
    { to: "/jobs", label: "Jobs", icon: <PlayIcon />, matches: ["/jobs"] },
    { to: "/monitoring", label: "Monitoring", icon: <HeartbeatIcon />, matches: ["/monitoring", "/activity", "/topology", "/search"] },
    { to: "/policies", label: "Governance", icon: <BalanceScaleIcon />, matches: ["/policies"] },
    { to: "/settings/application", label: "Settings", icon: <CogIcon />, matches: ["/settings", "/account", "/access"] },
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

  function isActivePath(matches: string[]) {
    return matches.some((path) => (path === "/" ? location.pathname === "/" : location.pathname === path || location.pathname.startsWith(`${path}/`)));
  }

  const openAlerts = alerts.filter((alert) => !alert.acknowledged_at && !alert.resolved_at);
  const closedAlerts = alerts.filter((alert) => alert.acknowledged_at || alert.resolved_at);

  const header = (
    <Masthead>
      <MastheadMain>
        <MastheadBrand>
          <MastheadLogo component={(props) => <RouterLink {...props} to="/" />}>
            <AapLogo />
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <div className="aam-masthead-actions">
          <Dropdown
            isOpen={userMenuOpen}
            onOpenChange={setUserMenuOpen}
            onSelect={() => setUserMenuOpen(false)}
            popperProps={{ position: "right" }}
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() => setUserMenuOpen((open) => !open)}
                isExpanded={userMenuOpen}
                variant="plainText"
              >
                {user?.username}
              </MenuToggle>
            )}
          >
            <DropdownList>
              <DropdownItem
                onClick={() => {
                  navigate("/settings/account");
                }}
              >
                Account
              </DropdownItem>
              <DropdownItem
                onClick={() => {
                  logout().then(() => navigate("/login"));
                }}
              >
                Log out
              </DropdownItem>
            </DropdownList>
          </Dropdown>
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
      <PageSidebarBody usePageInsets>
        <p className="aam-sidebar-product">Advanced Automation Manager</p>
        <Nav aria-label="Main navigation">
          <NavList>
            {links.map((link) => (
              <NavItem key={link.to} itemId={link.to} icon={link.icon} isActive={isActivePath(link.matches)}>
                <RouterLink to={link.to}>{link.label}</RouterLink>
              </NavItem>
            ))}
          </NavList>
        </Nav>
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
