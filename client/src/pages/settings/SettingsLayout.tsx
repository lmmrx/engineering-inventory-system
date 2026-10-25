import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useT } from "../../i18n";
import { settingsGroupsForUser } from "./settingsNav";

export function SettingsIndex() {
  const { user } = useAuth();
  if (!user) return null;
  const groups = settingsGroupsForUser(user);
  const target = groups[0]?.items[0]?.to ?? "profile";
  return <Navigate to={target} replace />;
}

export function SettingsLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  if (!user) return null;
  const groups = settingsGroupsForUser(user);

  return (
    <div>
      <h1 className="text-lg font-semibold text-ink-100 mb-4">{t("settings.title")}</h1>
      {/* Phones: one dropdown instead of the full list, so the page content isn't pushed far down. */}
      <select
        value={location.pathname}
        onChange={(e) => navigate(e.target.value)}
        className="input-field md:hidden mb-4"
        aria-label={t("settings.choosePage")}
      >
        {groups.map((group) => (
          <optgroup key={group.label} label={t(group.label)}>
            {group.items.map((item) => (
              <option key={item.to} value={`/settings/${item.to}`}>
                {t(item.label)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <div className="grid gap-6 md:grid-cols-[200px_1fr] items-start">
        <nav className="space-y-5 hidden md:block">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-2.5 text-xs font-semibold uppercase tracking-wide text-ink-600 mb-1">
                {t(group.label)}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    // Exact match, so "Profile" isn't also highlighted on Profile → Appearance.
                    end
                    className={({ isActive }) =>
                      `block px-2.5 py-1.5 rounded-md text-sm transition ${
                        isActive
                          ? "bg-gold-500/15 text-gold-300"
                          : "text-ink-300 hover:bg-navy-800 hover:text-ink-100"
                      }`
                    }
                  >
                    {t(item.label)}
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
