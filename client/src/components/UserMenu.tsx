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

export function UserMenu() {
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
  // Size the header label to the worst-case combination so it never truncates
  // and doesn't shift width as the selection changes.
  const longestHotelCode = Math.max("All Hotels".length, ...hotels.map((h) => h.code.length));
  const longestDepartmentName = Math.max(0, ...departments.map((d) => d.name.length));
  const headerLabelWidth = longestHotelCode + 3 + longestDepartmentName;

  function closeMenu() {
    setOpen(false);
    setPanel("main");
  }

  function goTo(path: string) {
    navigate(path);
    closeMenu();
  }

  return (
    <div className="relative flex-none flex items-center gap-1.5" ref={containerRef}>
      <span
        className="hidden md:inline text-sm text-ink-200 whitespace-nowrap"
        style={{ minWidth: `${headerLabelWidth}ch` }}
      >
        <span className="font-mono">{currentHotelCode}</span>
        <span className="text-ink-600"> · </span>
        <span>{currentDepartmentName}</span>
      </span>

      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 rounded-full bg-gold-500 text-white text-sm font-semibold flex items-center justify-center hover:bg-gold-600 transition flex-none"
        aria-label="Account menu"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 card shadow-2xl shadow-black/50 py-1.5 z-20">
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
