import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Form,
  FormGroup,
  Label,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Nav,
  NavItem,
  NavList,
  Page,
  PageSection,
  PageSidebar,
  PageSidebarBody,
  Stack,
  StackItem,
  TextInput,
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
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
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
        .alerts()
        .then((items) => {
          if (!cancelled) {
            setAlerts(items);
          }
        })
        .catch(() => undefined);
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
          {user?.id ? (
            <Button variant="link" onClick={() => setPasswordOpen(true)}>
              Password
            </Button>
          ) : null}
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
              aria-label={alerts.length ? `${alerts.length} critical alerts` : "No critical alerts"}
              onClick={() => setAlertsOpen((open) => !open)}
            >
              <BellIcon />
              {alerts.length ? <span className="aam-alerts__count">{alerts.length}</span> : null}
            </Button>
            {alertsOpen ? (
              <div className="aam-alerts__panel" role="dialog" aria-label="Critical alerts">
                <Title headingLevel="h2" size="md">
                  Critical estates
                </Title>
                {alerts.length === 0 ? (
                  <p className="aam-muted">No open critical alerts.</p>
                ) : (
                  <ul className="aam-alerts__list">
                    {alerts.map((alert) => (
                      <li key={alert.id}>
                        <RouterLink to={`/environments/${alert.environment_id}`} onClick={() => setAlertsOpen(false)}>
                          {alert.environment_name}
                        </RouterLink>
                        <p>{alert.message}</p>
                        <Button
                          variant="link"
                          isInline
                          onClick={() => {
                            api
                              .acknowledgeAlert(alert.id)
                              .then(() => setAlerts((current) => current.filter((item) => item.id !== alert.id)))
                              .catch(() => undefined);
                          }}
                        >
                          Dismiss
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
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
      <Modal
        isOpen={passwordOpen}
        variant="small"
        onClose={() => setPasswordOpen(false)}
        aria-labelledby="change-password-title"
      >
        <ModalHeader title="Change password" labelId="change-password-title" />
        <ModalBody>
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              if (!user?.id) {
                return;
              }
              if (nextPassword !== confirmPassword) {
                setPasswordError("The passwords do not match.");
                return;
              }
              setPasswordBusy(true);
              setPasswordError("");
              api
                .updateAccessUser(user.id, { password: nextPassword })
                .then(() => {
                  setNextPassword("");
                  setConfirmPassword("");
                  setPasswordOpen(false);
                })
                .catch((err: unknown) => setPasswordError(err instanceof Error ? err.message : "The password could not be changed."))
                .finally(() => setPasswordBusy(false));
            }}
          >
            <FormGroup label="New password" fieldId="account-password" isRequired>
              <TextInput id="account-password" type="password" value={nextPassword} onChange={(_event, value) => setNextPassword(value)} />
            </FormGroup>
            <FormGroup label="Confirm password" fieldId="account-password-confirm" isRequired>
              <TextInput
                id="account-password-confirm"
                type="password"
                value={confirmPassword}
                onChange={(_event, value) => setConfirmPassword(value)}
              />
            </FormGroup>
            {passwordError ? <p className="aam-muted">{passwordError}</p> : null}
            <ModalFooter>
              <Button type="submit" variant="primary" isDisabled={passwordBusy || nextPassword.length === 0} isLoading={passwordBusy}>
                Save password
              </Button>
              <Button variant="link" onClick={() => setPasswordOpen(false)}>
                Cancel
              </Button>
            </ModalFooter>
          </Form>
        </ModalBody>
      </Modal>
    </Page>
  );
}
