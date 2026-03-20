import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "Overview" },
  { to: "/environments", label: "Environments" },
  { to: "/policies", label: "Governance" },
  { to: "/topology", label: "Topology" },
  { to: "/search", label: "Search" },
  { to: "/settings", label: "Administration" },
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
        <div className="masthead__meta">
          <span>Fleet control plane</span>
          <span>Gateway-aware RBAC</span>
          <span>Remote AAP registration</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar__section">
            <p className="sidebar__title">Automation fleet</p>
            <nav className="sidebar__nav">
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
