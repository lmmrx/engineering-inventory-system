import { FormEvent, useState } from "react";
import { api, setAuthToken } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { CurrentUser, MIN_PASSWORD_LENGTH } from "../types";
import { PasswordInput } from "./PasswordInput";

export function ChangePasswordForm({ submitLabel = "Save password", onChanged }: { submitLabel?: string; onChanged?: () => void }) {
  const { updateUser } = useAuth();
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
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
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
      updateUser({ mustChangePassword: false });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not change the password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block">
        <span className="label-field">Current password</span>
        <PasswordInput
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="input-field"
        />
      </label>
      <label className="block">
        <span className="label-field">New password</span>
        <PasswordInput
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="input-field"
        />
        <span className="block text-xs text-ink-500 mt-1">
          At least {MIN_PASSWORD_LENGTH} characters. Common passwords aren't accepted.
        </span>
      </label>
      <label className="block">
        <span className="label-field">Confirm new password</span>
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
        <p className="text-sm text-emerald-400">Your password has been updated. Other devices have been signed out.</p>
      )}

      <div className="pt-2">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
