import { useAuth } from "../context/AuthContext";
import { daysUntilPasswordExpires } from "../types";
import { useT } from "../i18n";
import { ChangePasswordForm } from "../components/ChangePasswordForm";
import { Footer } from "../components/Footer";
import zsHoldingsLogo from "../assets/logo-zsholdings.png";

/**
 * Shown instead of the app while the account has a temporary or known-weak
 * password; the server refuses every other request until it's changed.
 */
export function ForcePasswordChange() {
  const { user, logout } = useAuth();
  const t = useT();

  return (
    <div className="min-h-screen flex flex-col bg-navy-950 bg-[radial-gradient(ellipse_at_top,rgba(31,111,235,0.15),transparent_60%)]">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="modal-panel max-w-sm">
          <div className="flex flex-col items-center text-center mb-6">
            <img src={zsHoldingsLogo} alt="ZS Holdings" className="h-14 w-auto mb-4" />
            <h1 className="text-lg font-semibold text-ink-100 leading-tight">{t("force.title")}</h1>
            <p className="text-sm text-ink-500 mt-1">
              {t(daysUntilPasswordExpires(user) === 0 ? "force.expired" : "force.temporary", { email: user?.email ?? "" })}
            </p>
          </div>
          <ChangePasswordForm submitLabel={t("force.submit")} />
          <button onClick={logout} className="mt-4 w-full text-center text-xs text-ink-500 hover:text-ink-300">
            {t("force.signOut")}
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
