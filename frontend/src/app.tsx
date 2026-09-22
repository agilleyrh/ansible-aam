import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ExclamationCircleIcon } from "@patternfly/react-icons";

import { AuthProvider, RequireAuth } from "./auth";
import { AppLayout } from "./components/layout";
import { MonitoringLayout } from "./components/section-tabs";
import { EmptyState } from "./components/empty-state";
import { LinkButton } from "./components/link-button";
import { AccessPage } from "./pages/access";
import { AccountPage } from "./pages/account";
import { ActivityPage } from "./pages/activity";
import { DashboardPage } from "./pages/dashboard";
import { EnvironmentDetailPage } from "./pages/environment-detail";
import { EnvironmentsPage } from "./pages/environments";
import { JobsPage } from "./pages/jobs";
import { SignInPage } from "./pages/login";
import { MonitoringPage } from "./pages/monitoring";
import { PoliciesPage } from "./pages/policies";
import { SearchPage } from "./pages/search";
import { ApplicationSettingsPage, SettingsLayout } from "./pages/settings";
import { TopologyPage } from "./pages/topology";

function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist or has been moved."
      icon={ExclamationCircleIcon}
      action={
        <LinkButton to="/" variant="primary">
          Return to dashboard
        </LinkButton>
      }
    />
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<SignInPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route element={<MonitoringLayout />}>
                <Route path="/monitoring" element={<MonitoringPage />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/topology" element={<TopologyPage />} />
                <Route path="/search" element={<SearchPage />} />
              </Route>
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/environments" element={<EnvironmentsPage />} />
              <Route path="/environments/:environmentId" element={<EnvironmentDetailPage />} />
              <Route path="/policies" element={<PoliciesPage />} />
              <Route path="/account" element={<Navigate to="/settings/account" replace />} />
              <Route path="/access" element={<Navigate to="/settings/access" replace />} />
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="application" replace />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="access" element={<AccessPage />} />
                <Route path="application" element={<ApplicationSettingsPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
