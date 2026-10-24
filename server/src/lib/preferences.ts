import { z } from "zod";

/**
 * Each user's own display settings (Settings → Customize profile). Stored on
 * the account so they follow the person to any device. Every field is a fixed
 * choice, so nothing arbitrary is ever stored or sent back to the browser.
 */
export const preferencesSchema = z
  .object({
    theme: z.enum(["dark", "light", "system"]),
    fontSize: z.enum(["tiny", "small", "default", "large", "huge"]),
    fontFamily: z.enum(["system", "classic", "serif", "rounded", "readable", "mono"]),
    zoom: z.union([z.literal(80), z.literal(90), z.literal(100), z.literal(110), z.literal(125), z.literal(150)]),
    // English, French, Filipino, Punjabi, Somali, Russian, Urdu, Romanian.
    language: z.enum(["en", "fr", "fil", "pa", "so", "ru", "ur", "ro"]),
  })
  .partial()
  .strict();

export type Preferences = z.infer<typeof preferencesSchema>;

/** Reads stored preferences, dropping anything no longer valid (e.g. a retired option). */
export function readPreferences(stored: unknown): Preferences {
  if (!stored || typeof stored !== "object") return {};
  const clean: Record<string, unknown> = {};
  const shape: Record<string, z.ZodTypeAny> = preferencesSchema.shape;
  for (const [key, value] of Object.entries(stored)) {
    if (key in shape && shape[key].safeParse(value).success) clean[key] = value;
  }
  return clean as Preferences;
}
