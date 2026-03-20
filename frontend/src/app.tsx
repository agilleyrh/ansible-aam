import { BrowserRouter, Link, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/layout";
import { EmptyState } from "./components/empty-state";
import { ActivityPage } from "./pages/activity";
import { DashboardPage } from "./pages/dashboard";
import { EnvironmentDetailPage } from "./pages/environment-detail";
import { EnvironmentsPage } from "./pages/environments";
import { PoliciesPage } from "./pages/policies";
import { SearchPage } from "./pages/search";
import { SettingsPage } from "./pages/settings";
import { TopologyPage } from "./pages/topology";

function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist or has been moved."
      action={<Link className="primary-button" to="/">Return to dashboard</Link>}
    />
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/environments" element={<EnvironmentsPage />} />
          <Route path="/environments/:environmentId" element={<EnvironmentDetailPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/policies" element={<PoliciesPage />} />
          <Route path="/topology" element={<TopologyPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
