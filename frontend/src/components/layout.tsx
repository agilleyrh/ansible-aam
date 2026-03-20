import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "Overview" },
  { to: "/environments", label: "Environments" },
  { to: "/activity", label: "Activity" },
  { to: "/policies", label: "Governance" },
  { to: "/topology", label: "Topology" },
  { to: "/search", label: "Search" },
  { to: "/settings", label: "Runtime settings" },
];

const quickLinks = [
  { to: "/environments", label: "Environment registry" },
  { to: "/activity", label: "Activity stream" },
  { to: "/settings", label: "Runtime settings" },
];

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="masthead">
        <div className="masthead__brand">
          <div className="masthead__mark">A</div>
          <div>
            <p className="eyebrow eyebrow--inverse">Red Hat Ansible Automation Platform</p>
            <h1>Advanced Automation Manager</h1>
          </div>
        </div>
        <nav className="masthead__quicklinks" aria-label="Quick navigation">
          {quickLinks.map((link) => (
            <NavLink key={link.to} to={link.to} className="masthead__quicklink">
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar__section">
            <p className="sidebar__title">Automation fleet</p>
            <nav className="sidebar__nav" aria-label="Main navigation">
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.to === "/"} className="sidebar__link">
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="sidebar__section sidebar__section--secondary">
            <p className="sidebar__title">Operating model</p>
            <p>Register AAP environments, validate service health, run inventory syncs, and review governance results from one hub.</p>
          </div>
        </aside>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
