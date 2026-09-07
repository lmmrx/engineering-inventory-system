import { Navigate, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { settingsGroupsForRole } from "./settingsNav";

export function SettingsIndex() {
  const { user } = useAuth();
  if (!user) return null;
  const groups = settingsGroupsForRole(user.role);
  const target = groups[0]?.items[0]?.to ?? "profile";
  return <Navigate to={target} replace />;
}

export function SettingsLayout() {
  const { user } = useAuth();
  if (!user) return null;
  const groups = settingsGroupsForRole(user.role);

  return (
    <div>
      <h1 className="text-lg font-semibold text-ink-100 mb-4">Settings</h1>
      <div className="grid gap-6 md:grid-cols-[200px_1fr] items-start">
        <nav className="space-y-5">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-2.5 text-xs font-semibold uppercase tracking-wide text-ink-600 mb-1">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `block px-2.5 py-1.5 rounded-md text-sm transition ${
                        isActive
                          ? "bg-gold-500/15 text-gold-300"
                          : "text-ink-300 hover:bg-navy-800 hover:text-ink-100"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
