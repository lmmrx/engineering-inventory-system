import { useAuth } from "../context/AuthContext";
import { daysUntilPasswordExpires } from "../types";
import { ChangePasswordForm } from "../components/ChangePasswordForm";
import { Footer } from "../components/Footer";
import zsHoldingsLogo from "../assets/logo-zsholdings.png";

/**
 * Shown instead of the app while the account has a temporary or known-weak
 * password; the server refuses every other request until it's changed.
 */
export function ForcePasswordChange() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-navy-950 bg-[radial-gradient(ellipse_at_top,rgba(31,111,235,0.15),transparent_60%)]">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="modal-panel max-w-sm">
          <div className="flex flex-col items-center text-center mb-6">
            <img src={zsHoldingsLogo} alt="ZS Holdings" className="h-14 w-auto mb-4" />
            <h1 className="text-lg font-semibold text-ink-100 leading-tight">Choose a new password</h1>
            <p className="text-sm text-ink-500 mt-1">
              {daysUntilPasswordExpires(user) === 0
                ? `The password for ${user?.email} has expired. Set a new one to continue.`
                : `${user?.email} is using a temporary or easily guessed password. Set a new one to continue.`}
            </p>
          </div>
          <ChangePasswordForm submitLabel="Set password and continue" />
          <button onClick={logout} className="mt-4 w-full text-center text-xs text-ink-500 hover:text-ink-300">
            Sign out instead
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
