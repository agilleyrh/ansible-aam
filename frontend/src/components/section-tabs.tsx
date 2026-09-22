import { Stack, StackItem, Tab, Tabs } from "@patternfly/react-core";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const monitoringTabs = [
  { key: "/monitoring", title: "Health" },
  { key: "/activity", title: "Activity" },
  { key: "/topology", title: "Topology" },
  { key: "/search", title: "Search" },
];

export function MonitoringSectionTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = monitoringTabs.some((tab) => tab.key === location.pathname) ? location.pathname : "/monitoring";

  return (
    <Tabs
      activeKey={active}
      onSelect={(_event, key) => navigate(String(key))}
      aria-label="Monitoring sections"
      component="nav"
      isNav
    >
      {monitoringTabs.map((tab) => (
        <Tab key={tab.key} eventKey={tab.key} title={tab.title} />
      ))}
    </Tabs>
  );
}

export function MonitoringLayout() {
  return (
    <Stack hasGutter>
      <StackItem>
        <MonitoringSectionTabs />
      </StackItem>
      <Outlet />
    </Stack>
  );
}
