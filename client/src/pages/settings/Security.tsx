import { FormEvent, useState } from "react";
import { api } from "../../api/client";
import { PasswordInput } from "../../components/PasswordInput";

export function SecuritySettings() {
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

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Current password is incorrect.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card p-5 max-w-lg">
      <h2 className="font-semibold text-ink-100 mb-1">Security</h2>
      <p className="text-sm text-ink-500 mb-5">Change the password used to sign in.</p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="label-field">Current password</span>
          <PasswordInput
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="input-field"
          />
        </label>
        <label className="block">
          <span className="label-field">New password</span>
          <PasswordInput
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input-field"
          />
        </label>
        <label className="block">
          <span className="label-field">Confirm new password</span>
          <PasswordInput
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-field"
          />
        </label>

        {error && <p className="text-sm text-rose-400">{error}</p>}
        {success && <p className="text-sm text-emerald-400">Your password has been updated.</p>}

        <div className="pt-2">
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Saving..." : "Save password"}
          </button>
        </div>
      </form>
    </div>
  );
}
