import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 10;
// bcrypt silently ignores everything past 72 bytes, so longer input would give
// a false sense of strength.
const MAX_PASSWORD_LENGTH = 72;

// The seed's default admin password and the passwords most often tried first
// in guessing attacks. Compared case-insensitively.
const COMMON_PASSWORDS = new Set(
  [
    "changeme123!", "changeme123", "changeme", "password", "password1", "password123", "password1234",
    "password!", "passw0rd", "p@ssw0rd", "p@ssword", "123456", "1234567", "12345678", "123456789",
    "1234567890", "12345678910", "qwerty", "qwerty123", "qwertyuiop", "1q2w3e4r", "1q2w3e4r5t",
    "abc123", "abcd1234", "111111", "000000", "iloveyou", "admin", "admin123", "admin1234",
    "administrator", "welcome", "welcome1", "welcome123", "letmein", "letmein123", "monkey",
    "dragon", "sunshine", "football", "baseball", "master", "superman", "trustno1", "hotel123",
    "inventory", "inventory123", "engineering", "housekeeping", "summer2026", "winter2026",
    "spring2026", "autumn2026", "fall2026",
  ].map((p) => p.toLowerCase())
);

export function isCommonPassword(password: string) {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

/** A password that should be replaced at the next opportunity (used to flag existing accounts at sign-in). */
export function isWeakPassword(password: string) {
  return password.length < MIN_PASSWORD_LENGTH || isCommonPassword(password);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a password lasts before it must be changed. Set
 * PASSWORD_MAX_AGE_DAYS on the server to change it, or to 0 to turn expiry off.
 */
export const PASSWORD_MAX_AGE_DAYS = (() => {
  const raw = process.env.PASSWORD_MAX_AGE_DAYS?.trim();
  const days = Number(raw);
  return raw && Number.isFinite(days) && days >= 0 ? Math.floor(days) : 90;
})();

/** When a password set at `changedAt` expires, or null if expiry is turned off. */
export function passwordExpiresAt(changedAt: Date): Date | null {
  return PASSWORD_MAX_AGE_DAYS > 0 ? new Date(changedAt.getTime() + PASSWORD_MAX_AGE_DAYS * DAY_MS) : null;
}

export function isPasswordExpired(changedAt: Date, now = Date.now()) {
  const expiresAt = passwordExpiresAt(changedAt);
  return expiresAt !== null && expiresAt.getTime() <= now;
}

/** The rule every newly chosen password must pass. */
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`)
  .refine((p) => !isCommonPassword(p), "That password is too common — choose something less guessable");
