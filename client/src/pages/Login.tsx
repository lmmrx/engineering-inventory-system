import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Footer } from "../components/Footer";
import { PasswordInput } from "../components/PasswordInput";
import zsHoldingsLogo from "../assets/logo-zsholdings.png";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-navy-950 via-navy-900 to-navy-950">
      <div className="flex-1 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="modal-panel max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <img src={zsHoldingsLogo} alt="ZS Holdings" className="h-8 w-auto flex-none" />
          <div>
            <h1 className="text-base font-semibold text-ink-100 leading-tight">Engineering Inventory</h1>
            <p className="text-xs text-ink-500">Sign in to continue</p>
          </div>
        </div>

        <label className="block">
          <span className="label-field">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field mb-4"
          />
        </label>

        <label className="block mb-4">
          <span className="label-field">Password</span>
          <PasswordInput
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
          />
        </label>

        {error && <p className="text-sm text-rose-400 mb-4">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      </div>
      <Footer />
    </div>
  );
}
