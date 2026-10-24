import { useCallback } from "react";
import { usePreferences } from "../context/PreferencesContext";
import type { Language } from "../preferences";
import { en, MessageKey } from "./en";
import { fil } from "./fil";
import { fr } from "./fr";
import { pa } from "./pa";
import { ro } from "./ro";
import { ru } from "./ru";
import { so } from "./so";
import type { Messages } from "./types";
import { ur } from "./ur";

export type { MessageKey } from "./en";

const DICTIONARIES: Record<Language, Messages> = { en, fr, fil, pa, so, ru, ur, ro };

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
  // Filipino and Somali formatting are well supported under their own codes; Urdu as Pakistan.
  return preferences.language === "ur" ? "ur-PK" : preferences.language;
}
