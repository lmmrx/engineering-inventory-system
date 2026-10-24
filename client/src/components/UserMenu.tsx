import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ALL_HOTELS, useHotelScope } from "../context/HotelScopeContext";
import { useDepartmentScope } from "../context/DepartmentScopeContext";

function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronUpDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="flex-none text-ink-500">
      <path d="M6.5 8 10 4.5 13.5 8M6.5 12 10 15.5 13.5 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="flex-none">
      <path d="M4 10.5 8 14.5 16 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const menuItemClass =
  "flex items-center justify-between gap-2 w-full text-left px-3 py-2 text-sm text-ink-200 hover:bg-navy-800 rounded-md transition";

type Panel = "main" | "property" | "department";

/**
 * The account menu. In the sidebar it shows your name and current property
 * and opens upward; in the phone top bar it's just the avatar.
 */
export function UserMenu({
  placement = "sidebar",
  compact = false,
}: {
  placement?: "sidebar" | "topbar";
  /** In a collapsed sidebar: just the avatar. */
  compact?: boolean;
}) {
  const { user, logout } = useAuth();
  const { hotels, selectedHotelId, setSelectedHotelId, canSwitchHotels } = useHotelScope();
  const { departments, selectedDepartmentId, setSelectedDepartmentId, canSwitchDepartments } = useDepartmentScope();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("main");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPanel("main");
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!user) return null;

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  const currentHotelCode =
    selectedHotelId === ALL_HOTELS ? "All Hotels" : hotels.find((h) => h.id === selectedHotelId)?.code ?? "—";
  const currentDepartmentName = departments.find((d) => d.id === selectedDepartmentId)?.name ?? "—";

  function closeMenu() {
    setOpen(false);
    setPanel("main");
  }

  function goTo(path: string) {
    navigate(path);
    closeMenu();
  }

  return (
    <div className={placement === "sidebar" ? "relative" : "relative flex-none"} ref={containerRef}>
      {placement === "sidebar" && !compact ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-navy-800 transition"
          aria-label="Account menu"
          aria-expanded={open}
        >
          <span className="h-8 w-8 rounded-full bg-gold-500 text-white text-sm font-semibold flex items-center justify-center flex-none">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-ink-100 truncate">{user.name}</span>
            <span className="block text-xs text-ink-500 truncate">
              {currentDepartmentName} · <span className="font-mono">{currentHotelCode}</span>
            </span>
          </span>
          <ChevronUpDown />
        </button>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          className="h-8 w-8 rounded-full bg-gold-500 text-white text-sm font-semibold flex items-center justify-center hover:bg-gold-600 transition flex-none"
          aria-label="Account menu"
          aria-expanded={open}
          title={compact ? `${user.name} · ${currentDepartmentName} · ${currentHotelCode}` : undefined}
        >
          {initial}
        </button>
      )}

      {open && (
        <div
          className={`absolute ${
            placement === "sidebar" ? "left-0 bottom-full mb-2" : "right-0 top-full mt-2"
          } w-72 max-w-[calc(100vw-2rem)] card shadow-2xl shadow-black/50 py-1.5 z-30`}
        >
          <div className="px-3 py-2 border-b border-navy-800 mb-1">
            <p className="text-sm font-medium text-ink-100 truncate">{user.name}</p>
            <p className="text-xs text-ink-500 truncate">{user.email}</p>
          </div>

          {panel === "main" && (
            <div className="px-1.5 space-y-0.5">
              <button
                onClick={() => (canSwitchHotels ? setPanel("property") : undefined)}
                className={`${menuItemClass} ${!canSwitchHotels ? "cursor-default hover:bg-transparent" : ""}`}
                disabled={!canSwitchHotels}
              >
                <span>
                  <span className="block text-ink-500 text-xs">Property</span>
                  <span className="block font-mono">{currentHotelCode}</span>
                </span>
                {canSwitchHotels && <ChevronRight />}
              </button>

              <button
                onClick={() => (canSwitchDepartments ? setPanel("department") : undefined)}
                className={`${menuItemClass} ${!canSwitchDepartments ? "cursor-default hover:bg-transparent" : ""}`}
                disabled={!canSwitchDepartments}
              >
                <span>
                  <span className="block text-ink-500 text-xs">Department</span>
                  <span className="block">{currentDepartmentName}</span>
                </span>
                {canSwitchDepartments && <ChevronRight />}
              </button>

              <div className="my-1 border-t border-navy-800" />

              <button onClick={() => goTo("/settings/profile")} className={menuItemClass}>
                Account settings
              </button>

              <div className="my-1 border-t border-navy-800" />

              <button
                onClick={() => {
                  closeMenu();
                  logout();
                }}
                className={`${menuItemClass} text-rose-400 hover:bg-rose-500/10`}
              >
                Sign out
              </button>
            </div>
          )}

          {panel === "property" && (
            <div className="px-1.5">
              <button onClick={() => setPanel("main")} className={`${menuItemClass} text-ink-500 mb-1`}>
                <span className="flex items-center gap-1">
                  <ChevronLeft />
                  Property
                </span>
              </button>
              <div className="max-h-72 overflow-y-auto space-y-0.5">
                <button
                  onClick={() => {
                    setSelectedHotelId(ALL_HOTELS);
                    closeMenu();
                  }}
                  className={menuItemClass}
                >
                  <span className="font-medium">All Hotels</span>
                  {selectedHotelId === ALL_HOTELS && <CheckIcon />}
                </button>
                <div className="my-1 border-t border-navy-800" />
                {hotels.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      setSelectedHotelId(h.id);
                      closeMenu();
                    }}
                    className={menuItemClass}
                  >
                    <span className="font-mono">{h.code}</span>
                    {h.id === selectedHotelId && <CheckIcon />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {panel === "department" && (
            <div className="px-1.5">
              <button onClick={() => setPanel("main")} className={`${menuItemClass} text-ink-500 mb-1`}>
                <span className="flex items-center gap-1">
                  <ChevronLeft />
                  Department
                </span>
              </button>
              <div className="max-h-72 overflow-y-auto space-y-0.5">
                {departments.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setSelectedDepartmentId(d.id);
                      closeMenu();
                    }}
                    className={menuItemClass}
                  >
                    <span>{d.name}</span>
                    {d.id === selectedDepartmentId && <CheckIcon />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
