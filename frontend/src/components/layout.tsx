import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "Overview" },
  { to: "/environments", label: "Environments" },
  { to: "/policies", label: "Governance" },
  { to: "/topology", label: "Topology" },
  { to: "/search", label: "Search" },
];

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Red Hat Ansible Automation Platform</p>
          <h1>Advanced Automation Manager</h1>
        </div>
        <div className="masthead__meta">
          <span>Fleet control plane</span>
          <span>Gateway-aware RBAC</span>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar__section">
          <p className="sidebar__title">Automation Fleet</p>
          <nav>
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === "/"} className="sidebar__link">
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="sidebar__section sidebar__section--secondary">
          <p className="sidebar__title">Operating Model</p>
          <p>Hub service, remote AAP environments, policy-driven oversight, and action relay through trusted identities.</p>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

