import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, warmUp } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Footer } from "../components/Footer";
import { PasswordInput } from "../components/PasswordInput";
import { Spinner } from "../components/Spinner";
import { useTakingLong } from "../hooks/useTakingLong";
import { MessageKey, useT } from "../i18n";
import zsHoldingsLogo from "../assets/logo-zsholdings.png";

/** A translation key, or the server's own message for other refusals (e.g. a lockout). */
function loginErrorMessage(err: unknown): { key: MessageKey } | { text: string } {
  if (err instanceof ApiError) {
    if (err.status === 400 || err.status === 401) return { key: "login.invalid" };
    if (err.status < 500) return { text: err.message };
  }
  return { key: "login.unreachable" };
}

export function Login() {
  const { login } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ReturnType<typeof loginErrorMessage> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const takingLong = useTakingLong(submitting);

  // The free API tier can be asleep when this page loads; wake it now so
  // it's more likely to be ready by the time the user submits the form.
  useEffect(() => {
    warmUp();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-navy-950 bg-[radial-gradient(ellipse_at_top,rgba(31,111,235,0.15),transparent_60%)]">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <form onSubmit={handleSubmit} className="modal-panel max-w-sm">
          <div className="flex flex-col items-center text-center mb-6">
            <img src={zsHoldingsLogo} alt="ZS Holdings" className="h-14 w-auto mb-4" />
            <h1 className="text-lg font-semibold text-ink-100 leading-tight">{t("app.name")}</h1>
            <p className="text-sm text-ink-500 mt-1">{t("login.subtitle")}</p>
          </div>

          <label className="block mb-4">
            <span className="label-field">{t("login.email")}</span>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
            />
          </label>

          <label className="block mb-4">
            <span className="label-field">{t("login.password")}</span>
            <PasswordInput
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2 mb-4"
            >
              {"key" in error ? t(error.key) : error.text}
            </p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting && <Spinner />}
            {submitting ? t("login.signingIn") : t("login.signIn")}
          </button>

          {takingLong && (
            <p className="text-xs text-ink-500 text-center mt-3" aria-live="polite">
              {t("login.waking")}
            </p>
          )}
        </form>
      </div>
      <Footer />
    </div>
  );
}
