import { useCallback } from "react";
import { usePreferences } from "../context/PreferencesContext";
import type { Language } from "../preferences";
import { en, MessageKey } from "./en";
import { fr } from "./fr";
import type { Messages } from "./types";

export type { MessageKey } from "./en";

const DICTIONARIES: Record<Language, Messages> = { en, fr };

/**
 * The text for `key` in `language`, falling back to English for anything not
 * yet translated. `{name}` placeholders are filled from `values`.
 */
export function translate(language: Language, key: MessageKey, values?: Record<string, string | number>) {
  const text = DICTIONARIES[language]?.[key] ?? en[key];
  return values ? text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match)) : text;
}

/** `t("nav.dashboard")` in the signed-in user's chosen language. */
export function useT() {
  const { preferences } = usePreferences();
  return useCallback(
    (key: MessageKey, values?: Record<string, string | number>) => translate(preferences.language, key, values),
    [preferences.language]
  );
}

/** Dates and numbers formatted for the chosen language. */
export function useLocale() {
  const { preferences } = usePreferences();
  // Canadian formats (e.g. dates), matching where the hotels are.
  return preferences.language === "fr" ? "fr-CA" : "en-CA";
}
