import { FormEvent, useState } from "react";
import { api, setAuthToken } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { CurrentUser, MIN_PASSWORD_LENGTH } from "../types";
import { PasswordInput } from "./PasswordInput";
import { useT } from "../i18n";

export function ChangePasswordForm({ submitLabel, onChanged }: { submitLabel?: string; onChanged?: () => void }) {
  const { updateUser } = useAuth();
  const t = useT();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t("password.tooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("password.mismatch"));
      return;
    }

    setSubmitting(true);
    try {
      // The server signs out every other session and hands this one a fresh token.
      const result = await api.post<{ token: string; user: CurrentUser }>("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setAuthToken(result.token);
      // Picks up the new expiry date too, which clears any reminder banner.
      updateUser({ mustChangePassword: false, passwordExpiresAt: result.user.passwordExpiresAt });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("password.changeFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block">
        <span className="label-field">{t("password.current")}</span>
        <PasswordInput
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="input-field"
        />
      </label>
      <label className="block">
        <span className="label-field">{t("password.new")}</span>
        <PasswordInput
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="input-field"
        />
        <span className="block text-xs text-ink-500 mt-1">
          {t("password.hint", { min: MIN_PASSWORD_LENGTH })}
        </span>
      </label>
      <label className="block">
        <span className="label-field">{t("password.confirm")}</span>
        <PasswordInput
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="input-field"
        />
      </label>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {success && (
        <p className="text-sm text-emerald-400">{t("password.changed")}</p>
      )}

      <div className="pt-2">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? t("common.saving") : submitLabel ?? t("password.save")}
        </button>
      </div>
    </form>
  );
}
