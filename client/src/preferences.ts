/**
 * The user's display settings (Settings → Customize profile): theme, font
 * size and family, page zoom, and language. They're saved on the account so
 * they follow the person to any device, and cached in this browser so the app
 * opens in the right look before the account has even loaded.
 */

export type Theme = "dark" | "light" | "system";
export type FontSize = "tiny" | "small" | "default" | "large" | "huge";
export type FontFamily = "system" | "classic" | "serif" | "rounded" | "readable" | "mono";
export type Zoom = 80 | 90 | 100 | 110 | 125 | 150;
export type Language = "en" | "fr";

export interface Preferences {
  theme: Theme;
  fontSize: FontSize;
  fontFamily: FontFamily;
  zoom: Zoom;
  language: Language;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "dark",
  fontSize: "default",
  fontFamily: "system",
  zoom: 100,
  language: "en",
};

/** Slider stops from tiny to huge, with how much each scales text. */
export const FONT_SIZES: { value: FontSize; scale: number }[] = [
  { value: "tiny", scale: 0.85 },
  { value: "small", scale: 0.93 },
  { value: "default", scale: 1 },
  { value: "large", scale: 1.12 },
  { value: "huge", scale: 1.28 },
];

/**
 * Font choices. All use fonts already on the device, so nothing is downloaded
 * (and the app's security policy only allows its own files anyway).
 */
export const FONT_FAMILIES: { value: FontFamily; stack: string }[] = [
  { value: "system", stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif' },
  { value: "classic", stack: 'Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif' },
  { value: "serif", stack: 'Georgia, Cambria, "Times New Roman", Times, serif' },
  { value: "rounded", stack: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Varela Round", "Segoe UI", sans-serif' },
  { value: "readable", stack: 'Verdana, Tahoma, "DejaVu Sans", "Segoe UI", sans-serif' },
  { value: "mono", stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' },
];

export const ZOOMS: Zoom[] = [80, 90, 100, 110, 125, 150];

/** Languages, each named in itself so people can find their own. */
export const LANGUAGES: { value: Language; nativeName: string; englishName: string; rtl?: boolean }[] = [
  { value: "en", nativeName: "English", englishName: "English" },
  { value: "fr", nativeName: "Français", englishName: "French" },
];

const STORAGE_KEY = "preferences";

/** Fills in defaults and drops anything unrecognized (e.g. from an older version). */
export function normalizePreferences(stored: unknown): Preferences {
  const p = (stored && typeof stored === "object" ? stored : {}) as Partial<Record<keyof Preferences, unknown>>;
  const pick = <T,>(value: unknown, allowed: readonly T[], fallback: T) =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    theme: pick(p.theme, ["dark", "light", "system"] as Theme[], DEFAULT_PREFERENCES.theme),
    fontSize: pick(p.fontSize, FONT_SIZES.map((f) => f.value), DEFAULT_PREFERENCES.fontSize),
    fontFamily: pick(p.fontFamily, FONT_FAMILIES.map((f) => f.value), DEFAULT_PREFERENCES.fontFamily),
    zoom: pick(p.zoom, ZOOMS, DEFAULT_PREFERENCES.zoom),
    language: pick(p.language, LANGUAGES.map((l) => l.value), DEFAULT_PREFERENCES.language),
  };
}

/** This browser's copy. Storage can be unavailable (private mode), so it's guarded. */
export function loadCachedPreferences(): Preferences {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function cachePreferences(preferences: Preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Not cached; the account copy still applies once it loads.
  }
}

const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;

/** Applies the settings to the page: theme, text size and font, zoom, language and direction. */
export function applyPreferences(p: Preferences) {
  const root = document.documentElement;
  const dark = p.theme === "dark" || (p.theme === "system" && systemDark());
  root.dataset.theme = dark ? "dark" : "light";
  root.style.setProperty("--font-scale", String(FONT_SIZES.find((f) => f.value === p.fontSize)?.scale ?? 1));
  root.style.setProperty("--font-sans", FONT_FAMILIES.find((f) => f.value === p.fontFamily)?.stack ?? FONT_FAMILIES[0].stack);
  // CSS zoom scales the whole page, layout included, like the browser's own zoom.
  root.style.setProperty("zoom", p.zoom === 100 ? "" : String(p.zoom / 100));
  const language = LANGUAGES.find((l) => l.value === p.language) ?? LANGUAGES[0];
  root.lang = language.value;
  root.dir = language.rtl ? "rtl" : "ltr";
  // Keeps the phone's status bar / browser chrome in step with the theme.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0d1117" : "#ffffff");
}

/** Re-applies "system" theme when the device switches between light and dark. */
export function watchSystemTheme(getCurrent: () => Preferences) {
  const query = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onChange = () => getCurrent().theme === "system" && applyPreferences(getCurrent());
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}
