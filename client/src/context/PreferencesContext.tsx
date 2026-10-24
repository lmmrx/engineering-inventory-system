import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import {
  Preferences,
  applyPreferences,
  cachePreferences,
  loadCachedPreferences,
  normalizePreferences,
  watchSystemTheme,
} from "../preferences";
import { useAuth } from "./AuthContext";

interface PreferencesContextValue {
  preferences: Preferences;
  /** Applies a change immediately, then saves it to the account. */
  updatePreferences: (patch: Partial<Preferences>) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useAuth();
  const [preferences, setPreferences] = useState<Preferences>(loadCachedPreferences);
  const current = useRef(preferences);
  current.current = preferences;

  // When an account signs in or loads, its saved settings win over this browser's copy.
  const accountPreferences = user?.preferences;
  useEffect(() => {
    if (!accountPreferences) return;
    const fromAccount = normalizePreferences(accountPreferences);
    setPreferences(fromAccount);
    cachePreferences(fromAccount);
  }, [accountPreferences]);

  useEffect(() => applyPreferences(preferences), [preferences]);
  useEffect(() => watchSystemTheme(() => current.current), []);

  async function updatePreferences(patch: Partial<Preferences>) {
    const next = { ...current.current, ...patch };
    setPreferences(next);
    cachePreferences(next);
    if (!user) return;
    await api.patch("/me", { preferences: patch });
    updateUser({ preferences: next });
  }

  return <PreferencesContext.Provider value={{ preferences, updatePreferences }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
