import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api, ApiError, getAuthToken, setAuthToken, withRetry } from "../api/client";
import { CurrentUser } from "../types";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (patch: Partial<CurrentUser>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAuthToken()) {
      setLoading(false);
      return;
    }
    // Retried because a cold API/DB fails like a network error. Only a real
    // rejection (401/403) or a deleted account (null) means the saved token
    // is bad - anything else keeps it so the next visit can still restore it.
    withRetry(() => api.get<CurrentUser | null>("/me"))
      .then((me) => {
        if (me) setUser(me);
        else setAuthToken(null);
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setAuthToken(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    // The free-tier API/DB can be cold on the first request after a quiet
    // period; withRetry covers that so the user doesn't have to re-submit.
    const { token, user } = await withRetry(() =>
      api.post<{ token: string; user: CurrentUser }>("/auth/login", { email, password })
    );
    setAuthToken(token);
    setUser(user);
  }

  function logout() {
    setAuthToken(null);
    setUser(null);
  }

  function updateUser(patch: Partial<CurrentUser>) {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
