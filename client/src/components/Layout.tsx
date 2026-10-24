import { ReactNode, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MessageKey, useT } from "../i18n";
import { Role } from "../types";
import { Footer } from "./Footer";
import { PasswordExpiryBanner } from "./PasswordExpiryBanner";
import { UserMenu } from "./UserMenu";
import zsHoldingsLogo from "../assets/logo-zsholdings.png";

/** Simple 20px outline icons, drawn in the current text color. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
      {children}
    </svg>
  );
}

const ICONS = {
  dashboard: (
    <Icon>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Icon>
  ),
  inventory: (
    <Icon>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </Icon>
  ),
  purchase: (
    <Icon>
      <path d="M3.5 4h2.2l2.1 11h10.4l1.8-7.5H7" />
      <circle cx="9.5" cy="19" r="1.3" />
      <circle cx="17" cy="19" r="1.3" />
    </Icon>
  ),
  workOrders: (
    <Icon>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5h6V3H9zM8.5 11l2 2 4-4M8.5 17h7" />
    </Icon>
  ),
  analytics: (
    <Icon>
      <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
    </Icon>
  ),
  settings: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Icon>
  ),
};

const NAV: { to: string; label: MessageKey; icon: ReactNode; end?: boolean; roles?: Role[] }[] = [
  { to: "/", label: "nav.dashboard", icon: ICONS.dashboard, end: true },
  { to: "/inventory", label: "nav.inventory", icon: ICONS.inventory },
  { to: "/purchase-requests", label: "nav.purchaseRequests", icon: ICONS.purchase },
  { to: "/work-orders", label: "nav.workOrders", icon: ICONS.workOrders },
  { to: "/analytics", label: "nav.analytics", icon: ICONS.analytics, roles: ["ADMIN", "MANAGER"] },
];

// Remembered per browser; storage can be unavailable (private mode), so every access is guarded.
const COLLAPSED_KEY = "sidebar-collapsed";
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}
function saveCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Not remembered this time; the toggle still works.
  }
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <Icon>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d={collapsed ? "m13 10 2 2-2 2" : "m15 10-2 2 2 2"} />
    </Icon>
  );
}

function MenuIcon() {
  return (
    <Icon>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function Layout() {
  const { user } = useAuth();
  const t = useT();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the phone drawer after navigating, and with Escape.
  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      saveCollapsed(!c);
      return !c;
    });
  }

  const links = NAV.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  /** The sidebar's contents, shared by the desktop sidebar and the phone drawer. */
  function sidebar(compact: boolean, onPhone: boolean) {
    const linkClass = ({ isActive }: { isActive: boolean }) =>
      `flex items-center gap-3 rounded-md text-sm font-medium transition ${
        compact ? "justify-center h-10 w-10 mx-auto" : "px-3 py-2"
      } ${isActive ? "bg-gold-500/15 text-gold-300" : "text-ink-300 hover:bg-navy-800 hover:text-ink-100"}`;

    return (
      <div className="flex h-full flex-col">
        <div className={`flex items-center gap-2 py-4 ${compact ? "justify-center px-2" : "px-4"}`}>
          <img src={zsHoldingsLogo} alt="ZS Holdings" className={`w-auto flex-none ${compact ? "h-6" : "h-7"}`} />
          {/* Wraps rather than cutting off, since some languages' names are longer. */}
          {!compact && <span className="font-semibold text-ink-100 flex-1 min-w-0 leading-tight break-words">{t("app.name")}</span>}
          {onPhone && (
            <button
              onClick={() => setDrawerOpen(false)}
              className="h-9 w-9 -me-1.5 flex items-center justify-center rounded-md text-ink-300 hover:bg-navy-800 hover:text-ink-100"
              aria-label={t("nav.closeMenu")}
            >
              <Icon>
                <path d="M6 6l12 12M18 6 6 18" />
              </Icon>
            </button>
          )}
        </div>

        <nav className={`flex-1 overflow-y-auto space-y-0.5 ${compact ? "px-2" : "px-3"}`} aria-label="Main">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={linkClass}
              title={compact ? t(item.label) : undefined}
            >
              {item.icon}
              {!compact && <span className="truncate">{t(item.label)}</span>}
            </NavLink>
          ))}

          <div className="my-2 border-t border-navy-800" />

          <NavLink to="/settings" className={linkClass} title={compact ? t("nav.settings") : undefined}>
            {ICONS.settings}
            {!compact && <span>{t("nav.settings")}</span>}
          </NavLink>
        </nav>

        <div className={`border-t border-navy-800 py-2 space-y-1 ${compact ? "px-2 flex flex-col items-center" : "px-3"}`}>
          {!onPhone && (
            <button
              onClick={toggleCollapsed}
              className={`flex items-center gap-3 rounded-md text-sm text-ink-500 hover:bg-navy-800 hover:text-ink-100 transition ${
                compact ? "justify-center h-10 w-10" : "w-full px-3 py-2"
              }`}
              aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
              title={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            >
              <CollapseIcon collapsed={collapsed} />
              {!compact && <span>{t("nav.collapse")}</span>}
            </button>
          )}
          <UserMenu placement="sidebar" compact={compact} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950">
      {/* Desktop: a fixed sidebar that folds down to icons. */}
      <aside
        className={`hidden lg:block fixed inset-y-0 start-0 z-20 border-e border-navy-800 bg-navy-950 transition-[width] duration-200 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {sidebar(collapsed, false)}
      </aside>

      {/* Phones and tablets: a top bar; the menu slides in from the left. The top
          padding keeps it clear of the iPhone notch when installed to the home screen. */}
      <header className="lg:hidden sticky top-0 z-20 bg-navy-950/95 backdrop-blur border-b border-navy-800 pt-[env(safe-area-inset-top)]">
        <div className="px-4 py-2.5 flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="h-9 w-9 -ms-1.5 flex items-center justify-center rounded-md text-ink-300 hover:bg-navy-800 hover:text-ink-100"
            aria-label={t("nav.openMenu")}
            aria-expanded={drawerOpen}
          >
            <MenuIcon />
          </button>
          <img src={zsHoldingsLogo} alt="ZS Holdings" className="h-6 w-auto" />
          <span className="font-semibold text-ink-100 flex-1 truncate">{t("app.name")}</span>
          <UserMenu placement="topbar" />
        </div>
      </header>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={t("nav.openMenu")}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 max-w-[85vw] bg-navy-950 border-e border-navy-800 shadow-2xl pt-[env(safe-area-inset-top)]">
            {sidebar(false, true)}
          </aside>
        </div>
      )}

      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ${collapsed ? "lg:ps-16" : "lg:ps-60"}`}>
        <main className="mx-auto max-w-[1600px] px-4 py-6 flex-1 w-full">
          <PasswordExpiryBanner />
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
}
