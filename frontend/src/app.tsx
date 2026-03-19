import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/layout";
import { DashboardPage } from "./pages/dashboard";
import { EnvironmentDetailPage } from "./pages/environment-detail";
import { EnvironmentsPage } from "./pages/environments";
import { PoliciesPage } from "./pages/policies";
import { SearchPage } from "./pages/search";
import { TopologyPage } from "./pages/topology";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/environments" element={<EnvironmentsPage />} />
          <Route path="/environments/:environmentId" element={<EnvironmentDetailPage />} />
          <Route path="/policies" element={<PoliciesPage />} />
          <Route path="/topology" element={<TopologyPage />} />
          <Route path="/search" element={<SearchPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

