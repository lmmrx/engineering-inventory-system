import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PASSWORD_REMINDER_DAYS, daysUntilPasswordExpires } from "../types";
import { useT } from "../i18n";

// "Remind me later" lasts until the browser tab is closed; storage can be
// unavailable (private mode), so every access is guarded.
const DISMISS_KEY = "password-reminder-dismissed";

function dismissedFor(expiresAt: string) {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === expiresAt;
  } catch {
    return false;
  }
}

/** Reminds the user to change their password in the days before it expires. */
export function PasswordExpiryBanner() {
  const { user } = useAuth();
  const t = useT();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(() => !!user?.passwordExpiresAt && dismissedFor(user.passwordExpiresAt));

  const days = daysUntilPasswordExpires(user);
  // Already on the page that changes it, so the banner would only be in the way.
  const onSecurityPage = location.pathname === "/settings/security";
  if (days === null || days > PASSWORD_REMINDER_DAYS || dismissed || onSecurityPage || !user?.passwordExpiresAt) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, user!.passwordExpiresAt!);
    } catch {
      // Not remembered; it hides for now either way.
    }
    setDismissed(true);
  }

  return (
    <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
      <p className="flex-1 text-amber-200">
        {days === 0 ? t("banner.expiresToday") : days === 1 ? t("banner.expiresInOne") : t("banner.expiresIn", { days })}{" "}
        <span className="text-amber-200/70">{t("banner.after")}</span>
      </p>
      <div className="flex items-center gap-2 flex-none">
        <Link to="/settings/security" className="btn-primary text-xs px-2.5 py-1.5">
          {t("banner.change")}
        </Link>
        <button onClick={dismiss} className="btn-ghost text-xs px-2.5 py-1.5">
          {t("banner.later")}
        </button>
      </div>
    </div>
  );
}
