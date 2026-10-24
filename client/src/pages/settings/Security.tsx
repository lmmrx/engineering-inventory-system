import { ChangePasswordForm } from "../../components/ChangePasswordForm";
import { useAuth } from "../../context/AuthContext";

const longDate = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" });

export function SecuritySettings() {
  const { user } = useAuth();
  return (
    <div className="card p-5 max-w-lg">
      <h2 className="font-semibold text-ink-100 mb-1">Security</h2>
      <p className="text-sm text-ink-500 mb-5">
        Change the password used to sign in. Changing it signs you out on every other device.
        {user?.passwordExpiresAt && (
          <>
            {" "}
            Your current password expires on{" "}
            <span className="text-ink-200">{longDate.format(new Date(user.passwordExpiresAt))}</span>.
          </>
        )}
      </p>
      <ChangePasswordForm />
    </div>
  );
}
