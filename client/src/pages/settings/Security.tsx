import { ChangePasswordForm } from "../../components/ChangePasswordForm";
import { useAuth } from "../../context/AuthContext";
import { useLocale, useT } from "../../i18n";

export function SecuritySettings() {
  const { user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const longDate = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" });
  return (
    <div className="card p-5 max-w-lg">
      <h2 className="font-semibold text-ink-100 mb-1">{t("settings.security")}</h2>
      <p className="text-sm text-ink-500 mb-5">
        {t("security.description")}
        {user?.passwordExpiresAt && (
          <> {t("security.expiresOn", { date: longDate.format(new Date(user.passwordExpiresAt)) })}</>
        )}
      </p>
      <ChangePasswordForm />
    </div>
  );
}
