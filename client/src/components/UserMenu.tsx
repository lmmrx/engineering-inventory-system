import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useHotelScope } from "../context/HotelScopeContext";

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

export function UserMenu() {
  const { user, logout } = useAuth();
  const { hotels, selectedHotelId, setSelectedHotelId, canSwitchHotels } = useHotelScope();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [showPropertyList, setShowPropertyList] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowPropertyList(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!user) return null;

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  const currentHotelName = hotels.find((h) => h.id === selectedHotelId)?.name ?? "—";
  // Size the label to the longest hotel name so it never truncates and doesn't
  // jump around in width when switching between shorter/longer property names.
  const longestHotelName = hotels.reduce((max, h) => Math.max(max, h.name.length), 0);

  function closeMenu() {
    setOpen(false);
    setShowPropertyList(false);
  }

  function goTo(path: string) {
    navigate(path);
    closeMenu();
  }

  return (
    <div className="relative flex-none flex items-center gap-2" ref={containerRef}>
      <span
        className="hidden lg:inline text-sm text-ink-200 whitespace-nowrap"
        style={{ minWidth: `${longestHotelName}ch` }}
      >
        {currentHotelName}
      </span>

      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 rounded-full bg-gold-500 text-white text-sm font-semibold flex items-center justify-center hover:bg-gold-600 transition flex-none"
        aria-label="Account menu"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 card shadow-2xl shadow-black/50 py-1.5 z-20">
          <div className="px-3 py-2 border-b border-navy-800 mb-1">
            <p className="text-sm font-medium text-ink-100 truncate">{user.name}</p>
            <p className="text-xs text-ink-500 truncate">{user.email}</p>
          </div>

          {!showPropertyList ? (
            <div className="px-1.5 space-y-0.5">
              <button
                onClick={() => (canSwitchHotels ? setShowPropertyList(true) : undefined)}
                className={`${menuItemClass} items-start ${!canSwitchHotels ? "cursor-default hover:bg-transparent" : ""}`}
                disabled={!canSwitchHotels}
              >
                <span className="min-w-0">
                  <span className="block text-ink-500 text-xs">Property</span>
                  <span className="block leading-snug break-words">{currentHotelName}</span>
                </span>
                {canSwitchHotels && <ChevronRight />}
              </button>

              <div className="my-1 border-t border-navy-800" />

              <button onClick={() => goTo("/settings/profile")} className={menuItemClass}>
                Account settings
              </button>
              <button onClick={() => goTo("/settings/appearance")} className={menuItemClass}>
                Appearance
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
          ) : (
            <div className="px-1.5">
              <button onClick={() => setShowPropertyList(false)} className={`${menuItemClass} text-ink-500 mb-1`}>
                <span className="flex items-center gap-1">
                  <ChevronLeft />
                  Property
                </span>
              </button>
              <div className="max-h-72 overflow-y-auto space-y-0.5">
                {hotels.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      setSelectedHotelId(h.id);
                      setShowPropertyList(false);
                      closeMenu();
                    }}
                    className={menuItemClass}
                  >
                    <span className="break-words leading-snug">{h.name}</span>
                    {h.id === selectedHotelId && <CheckIcon />}
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
