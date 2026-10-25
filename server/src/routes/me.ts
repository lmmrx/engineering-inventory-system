import { Request, Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { audit, diff } from "../lib/audit";
import { preferencesSchema, readPreferences } from "../lib/preferences";
import { loadPublicUser } from "../lib/publicUser";
import { requireAuth } from "../middleware/auth";

/** The signed-in user's own account: details, preferences and photo. */
export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await loadPublicUser(req.user!.userId));
  })
);

/**
 * Who the user may pick as their manager: active Admins, plus Managers at the
 * user's own hotel. Never themselves.
 */
async function managerOptions(req: Request) {
  const me = req.user!;
  return prisma.user.findMany({
    where: {
      id: { not: me.userId },
      disabledAt: null,
      OR: [{ role: "ADMIN" }, ...(me.hotelId ? [{ role: "MANAGER" as const, hotelId: me.hotelId }] : [])],
    },
    select: { id: true, name: true, role: true, position: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

meRouter.get(
  "/manager-options",
  asyncHandler(async (req, res) => {
    res.json(await managerOptions(req));
  })
);

// Digits, spaces and the usual phone punctuation; at least 5 digits.
const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9+()\-.\s]*$/, "Use digits, spaces and + ( ) - . only")
  .refine((v) => v === "" || (v.match(/\d/g) ?? []).length >= 5, "Enter a complete phone number");

// Users can change their own details and display preferences, nothing else
// (never their role, hotel, department or email).
const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    position: z.string().trim().max(100),
    phone: phoneSchema,
    managerId: z.string().min(1).nullable(),
    preferences: preferencesSchema,
  })
  .partial()
  .strict();

meRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const data = parsed.data;

    if (data.managerId) {
      const allowed = await managerOptions(req);
      if (!allowed.some((m) => m.id === data.managerId)) {
        return res.status(400).json({ error: "Choose an Admin, or a Manager at your hotel" });
      }
    }

    const before = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
    const user = await prisma.user.update({
      where: { id: before.id },
      data: {
        name: data.name,
        // Blank clears the field.
        position: data.position === undefined ? undefined : data.position || null,
        phone: data.phone === undefined ? undefined : data.phone || null,
        managerId: data.managerId,
        // Merged, so changing the theme doesn't reset the language.
        preferences: data.preferences ? { ...readPreferences(before.preferences), ...data.preferences } : undefined,
      },
    });

    const changes = await diff(before, user, ["name", "position", "phone", "managerId"]);
    if (Object.keys(changes).length > 0) {
      await audit(req, {
        action: "user.updated",
        entityId: user.id,
        summary: changes.name
          ? `${before.name} renamed themselves to ${user.name}`
          : `${user.name} updated their profile`,
        changes,
        hotelId: user.hotelId,
        departmentId: user.departmentId,
      });
    }
    res.json(await loadPublicUser(user.id));
  })
);

// ---------------------------------------------------------------- Photo

// The browser shrinks photos to a 256px square (~20–40 KB) before uploading,
// so this is a generous ceiling, not a target.
const MAX_AVATAR_BYTES = 250 * 1024;

// The first bytes of each allowed format, so a file can't claim to be a
// picture while containing something else.
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
};

const avatarSchema = z.object({ image: z.string().max(400_000) }).strict();

meRouter.put(
  "/avatar",
  asyncHandler(async (req, res) => {
    const parsed = avatarSchema.safeParse(req.body);
    const match = parsed.success ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(parsed.data.image) : null;
    if (!match) return res.status(400).json({ error: "Upload a JPEG, PNG or WebP image" });

    const [, mimeType, base64] = match;
    const data = Buffer.from(base64, "base64");
    if (data.length === 0 || data.length > MAX_AVATAR_BYTES) {
      return res.status(400).json({ error: "That photo is too large — try a smaller one" });
    }
    if (!SIGNATURES[mimeType](data)) return res.status(400).json({ error: "That file isn't a valid image" });

    const userId = req.user!.userId;
    await prisma.userAvatar.upsert({
      where: { userId },
      create: { userId, mimeType, data },
      update: { mimeType, data },
    });
    const user = await loadPublicUser(userId);
    await audit(req, {
      action: "user.updated",
      entityId: userId,
      summary: `${user!.name} changed their profile photo`,
      hotelId: user!.hotelId,
      departmentId: user!.departmentId,
    });
    res.json(user);
  })
);

meRouter.delete(
  "/avatar",
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const { count } = await prisma.userAvatar.deleteMany({ where: { userId } });
    const user = await loadPublicUser(userId);
    if (count > 0) {
      await audit(req, {
        action: "user.updated",
        entityId: userId,
        summary: `${user!.name} removed their profile photo`,
        hotelId: user!.hotelId,
        departmentId: user!.departmentId,
      });
    }
    res.json(user);
  })
);

/** Anyone signed in can see colleagues' photos. */
export const avatarsRouter = Router();

avatarsRouter.get(
  "/:userId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const avatar = await prisma.userAvatar.findUnique({ where: { userId: req.params.userId } });
    if (!avatar) return res.status(404).json({ error: "No photo" });
    res.setHeader("Content-Type", avatar.mimeType);
    // The app asks with ?v=<version>, so a cached copy is never stale.
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.send(avatar.data);
  })
);
