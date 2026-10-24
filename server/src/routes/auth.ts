import { Request, Response, Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { signToken } from "../lib/auth";
import { audit } from "../lib/audit";
import { isPasswordExpired, isWeakPassword, passwordExpiresAt, passwordSchema } from "../lib/password";
import { FailureLimiter } from "../lib/rateLimit";
import { readPreferences } from "../lib/preferences";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

const WINDOW_MS = 15 * 60 * 1000;
// Wrong passwords in a row before an account is locked for WINDOW_MS. Real
// accounts track this in the database (so an Admin can see and lift a lock);
// emails with no account use the in-memory limiter so they behave identically
// and the response doesn't reveal which emails exist.
export const MAX_FAILED_LOGINS = 5;
const unknownEmailLimiter = new FailureLimiter(MAX_FAILED_LOGINS, WINDOW_MS);
// Per IP: stops one source spraying guesses across many accounts.
const ipLimiter = new FailureLimiter(20, WINDOW_MS);
// Per signed-in user, for the current-password check on a password change.
const changePasswordLimiter = new FailureLimiter(5, WINDOW_MS);

// Compared against when the email doesn't exist, so an unknown email takes as
// long to reject as a wrong password and response timing can't reveal which
// emails have accounts.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-used-for-timing-only", 10);

function tooManyAttempts(res: Response, retryAfterSeconds: number) {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return res.status(429).json({
    error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  });
}

/** The signed-in user as the app sees it, from sign-in and from GET /me. */
export function publicUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  hotelId: string | null;
  departmentId: string | null;
  mustChangePassword: boolean;
  passwordChangedAt: Date;
  preferences: unknown;
}) {
  const { id, name, email, role, hotelId, departmentId, mustChangePassword } = user;
  // Lets the app remind the user before their password expires.
  const passwordExpires = passwordExpiresAt(user.passwordChangedAt);
  return {
    id,
    name,
    email,
    role,
    hotelId,
    departmentId,
    mustChangePassword,
    passwordExpiresAt: passwordExpires,
    preferences: readPreferences(user.preferences),
  };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

authRouter.post(
  "/login",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;
    const accountKey = email.toLowerCase();
    const ipKey = req.ip ?? "unknown";

    const ipBlockedFor = ipLimiter.retryAfter(ipKey);
    if (ipBlockedFor > 0) return tooManyAttempts(res, ipBlockedFor);

    // Emails are matched case-insensitively ("Jane@Hotel.com" signs in as
    // jane@hotel.com); an exact match wins if older data has both spellings.
    const user =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } }));
    const now = Date.now();
    const lockedFor = user
      ? user.lockedUntil && user.lockedUntil.getTime() > now
        ? Math.ceil((user.lockedUntil.getTime() - now) / 1000)
        : 0
      : unknownEmailLimiter.retryAfter(accountKey, now);
    if (lockedFor > 0) return tooManyAttempts(res, lockedFor);

    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !valid) {
      ipLimiter.fail(ipKey);
      let nowLocked = false;
      if (user) {
        // A lock that has expired starts a fresh count.
        const previous = user.lockedUntil ? 0 : user.failedLoginCount;
        nowLocked = previous + 1 >= MAX_FAILED_LOGINS;
        await prisma.user.update({
          where: { id: user.id },
          data: nowLocked
            ? { failedLoginCount: 0, lockedUntil: new Date(now + WINDOW_MS) }
            : { failedLoginCount: previous + 1, lockedUntil: null },
        });
      } else {
        unknownEmailLimiter.fail(accountKey, now);
      }
      await audit(req, {
        action: "auth.login_failed",
        entityId: user?.id,
        summary: user
          ? `Failed sign-in for ${user.email} (wrong password)${nowLocked ? " — account temporarily locked" : ""}`
          : `Failed sign-in for unknown email ${email}`,
        actorUserId: user?.id ?? null,
        hotelId: user?.hotelId,
        departmentId: user?.departmentId,
      });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Only reported after a correct password, so it reveals nothing to a guesser.
    if (user.disabledAt) {
      return res.status(403).json({ error: "This account has been disabled. Contact your administrator." });
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    }

    let mustChangePassword = user.mustChangePassword;
    // Catches the seed's default admin password and any pre-policy weak one.
    const weak = isWeakPassword(password);
    const expired = isPasswordExpired(user.passwordChangedAt);
    if (!mustChangePassword && (weak || expired)) {
      mustChangePassword = true;
      await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    }

    await audit(req, {
      action: "auth.login",
      entityId: user.id,
      summary: `${user.name} signed in${
        expired ? " (password expired — change required)" : mustChangePassword ? " (password change required)" : ""
      }`,
      actorUserId: user.id,
      hotelId: user.hotelId,
      departmentId: user.departmentId,
    });

    res.json({ token: signToken(user), user: publicUser({ ...user, mustChangePassword }) });
  })
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { currentPassword, newPassword } = parsed.data;
    const limiterKey = req.user!.userId;

    const blockedFor = changePasswordLimiter.retryAfter(limiterKey);
    if (blockedFor > 0) return tooManyAttempts(res, blockedFor);

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      changePasswordLimiter.fail(limiterKey);
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: "Choose a password different from your current one" });
    }
    changePasswordLimiter.reset(limiterKey);

    // Bumping the version signs out every other session; this one gets a fresh token.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });
    await audit(req, {
      action: "auth.password_changed",
      entityId: user.id,
      summary: `${user.name} changed their password${user.mustChangePassword ? " (required)" : ""}; other sessions signed out`,
      hotelId: user.hotelId,
      departmentId: user.departmentId,
    });

    res.json({ ok: true, token: signToken(updated), user: publicUser(updated) });
  })
);
