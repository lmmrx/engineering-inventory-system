import { ChangePasswordForm } from "../../components/ChangePasswordForm";

export function SecuritySettings() {
  return (
    <div className="card p-5 max-w-lg">
      <h2 className="font-semibold text-ink-100 mb-1">Security</h2>
      <p className="text-sm text-ink-500 mb-5">
        Change the password used to sign in. Changing it signs you out on every other device.
      </p>
      <ChangePasswordForm />
    </div>
  );
}
