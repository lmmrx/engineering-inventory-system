import { Request, Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { audit, created, diff } from "../lib/audit";
import { passwordSchema } from "../lib/password";
import { NO_SCOPE, requireAuth, requireRole } from "../middleware/auth";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole("ADMIN", "MANAGER"));

const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  hotelId: true,
  departmentId: true,
  createdAt: true,
  disabledAt: true,
  lockedUntil: true,
  mustChangePassword: true,
} as const;

usersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    // A Manager is the admin for exactly one (hotel, department) pair — they
    // only ever see users in that same pair, never other departments at
    // their own hotel or other hotels in their own department.
    const where =
      req.user!.role === "MANAGER"
        ? { hotelId: req.user!.hotelId ?? NO_SCOPE, departmentId: req.user!.departmentId ?? NO_SCOPE }
        : {};
    const users = await prisma.user.findMany({ where, select: publicSelect, orderBy: { name: "asc" } });
    res.json(users);
  })
);

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  role: z.enum(["ADMIN", "MANAGER", "STAFF"]),
  hotelId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
});

usersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const data = parsed.data;

    // A Manager may only create Staff users scoped to their own hotel and department.
    if (req.user!.role === "MANAGER") {
      if (data.role !== "STAFF" || data.hotelId !== req.user!.hotelId) {
        return res.status(403).json({ error: "Managers may only create Staff users for their own hotel" });
      }
      if (data.departmentId !== req.user!.departmentId) {
        return res.status(403).json({ error: "Managers may only create Staff users in their own department" });
      }
    }

    if (data.role !== "ADMIN" && (!data.hotelId || !data.departmentId)) {
      return res.status(400).json({ error: "Managers and Staff need both a hotel and a department" });
    }

    // Older accounts may have mixed-case emails, so compare case-insensitively.
    const existing = await prisma.user.findFirst({ where: { email: { equals: data.email, mode: "insensitive" } } });
    if (existing) {
      return res.status(409).json({ error: "A user with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        hotelId: data.hotelId ?? null,
        departmentId: data.departmentId ?? null,
        // The creator knows this password, so it's only good for the first sign-in.
        mustChangePassword: true,
      },
      select: publicSelect,
    });
    await audit(req, {
      action: "user.created",
      entityId: user.id,
      summary: `Created user ${user.name} (${user.email}) as ${user.role}`,
      changes: await created(user, ["name", "email", "role", "hotelId", "departmentId"]),
      hotelId: user.hotelId,
      departmentId: user.departmentId,
    });
    res.status(201).json(user);
  })
);

/**
 * Loads the target user and checks the caller may manage them. A Manager is
 * the admin for their own (hotel, department) pair only — they may only touch
 * Staff already inside that pair.
 */
async function loadManageable(req: Request): Promise<{ user: User } | { status: number; error: string }> {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return { status: 404, error: "User not found" };
  if (
    req.user!.role === "MANAGER" &&
    (user.role !== "STAFF" || user.hotelId !== req.user!.hotelId || user.departmentId !== req.user!.departmentId)
  ) {
    return { status: 403, error: "Forbidden" };
  }
  return { user };
}

/** Whether removing this user's admin access would leave no active Admin to manage the system. */
async function isLastActiveAdmin(user: User) {
  if (user.role !== "ADMIN" || user.disabledAt) return false;
  const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", disabledAt: null } });
  return activeAdmins <= 1;
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "MANAGER", "STAFF"]).optional(),
  hotelId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  password: passwordSchema.optional(),
});

usersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const loaded = await loadManageable(req);
    if ("error" in loaded) return res.status(loaded.status).json({ error: loaded.error });
    const existing = loaded.user;

    if (req.user!.role === "MANAGER") {
      // ...and may not move anyone out of that pair or hand out Manager/Admin privileges.
      if (parsed.data.role && parsed.data.role !== "STAFF") {
        return res.status(403).json({ error: "Managers may not change a user's role to Manager or Admin" });
      }
      if (parsed.data.hotelId !== undefined && parsed.data.hotelId !== req.user!.hotelId) {
        return res.status(403).json({ error: "Managers may not move a user to another hotel" });
      }
      if (parsed.data.departmentId !== undefined && parsed.data.departmentId !== req.user!.departmentId) {
        return res.status(403).json({ error: "Managers may not move a user to another department" });
      }
    }

    if (parsed.data.role && parsed.data.role !== "ADMIN" && (await isLastActiveAdmin(existing))) {
      return res.status(400).json({ error: "This is the only active Admin — make someone else an Admin first" });
    }

    const role = parsed.data.role ?? existing.role;
    const hotelId = parsed.data.hotelId !== undefined ? parsed.data.hotelId : existing.hotelId;
    const departmentId = parsed.data.departmentId !== undefined ? parsed.data.departmentId : existing.departmentId;
    if (role !== "ADMIN" && (!hotelId || !departmentId)) {
      return res.status(400).json({ error: "Managers and Staff need both a hotel and a department" });
    }

    const { password, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (password) {
      // The resetter knows the new password, so the user must replace it, and
      // any session that knew the old one is signed out.
      data.passwordHash = await bcrypt.hash(password, 10);
      data.mustChangePassword = true;
      data.tokenVersion = { increment: 1 };
    }

    const user = await prisma.user.update({ where: { id: existing.id }, data, select: publicSelect });

    const changes = await diff(existing, user, ["name", "role", "hotelId", "departmentId"]);
    // Never log the password itself — only that it was reset.
    if (password) changes.password = { from: null, to: "reset" };
    if (Object.keys(changes).length > 0) {
      await audit(req, {
        action: "user.updated",
        entityId: user.id,
        summary: changes.role
          ? `Changed ${user.name}'s role from ${existing.role} to ${user.role}`
          : password && Object.keys(changes).length === 1
          ? `Reset password for ${user.name}`
          : `Updated user ${user.name}`,
        changes,
        hotelId: user.hotelId,
        departmentId: user.departmentId,
      });
    }
    res.json(user);
  })
);

usersRouter.post(
  "/:id/disable",
  asyncHandler(async (req, res) => {
    const loaded = await loadManageable(req);
    if ("error" in loaded) return res.status(loaded.status).json({ error: loaded.error });
    const existing = loaded.user;

    if (existing.id === req.user!.userId) {
      return res.status(400).json({ error: "You can't disable your own account" });
    }
    if (await isLastActiveAdmin(existing)) {
      return res.status(400).json({ error: "This is the only active Admin — make someone else an Admin first" });
    }
    if (existing.disabledAt) return res.json(await prisma.user.findUnique({ where: { id: existing.id }, select: publicSelect }));

    // requireAuth rejects disabled users, so this ends their current sessions too.
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { disabledAt: new Date() },
      select: publicSelect,
    });
    await audit(req, {
      action: "user.disabled",
      entityId: user.id,
      summary: `Disabled ${user.name} (${user.email}); their sessions were signed out`,
      hotelId: user.hotelId,
      departmentId: user.departmentId,
    });
    res.json(user);
  })
);

usersRouter.post(
  "/:id/enable",
  asyncHandler(async (req, res) => {
    const loaded = await loadManageable(req);
    if ("error" in loaded) return res.status(loaded.status).json({ error: loaded.error });
    const existing = loaded.user;
    if (!existing.disabledAt) return res.json(await prisma.user.findUnique({ where: { id: existing.id }, select: publicSelect }));

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { disabledAt: null, failedLoginCount: 0, lockedUntil: null },
      select: publicSelect,
    });
    await audit(req, {
      action: "user.enabled",
      entityId: user.id,
      summary: `Re-enabled ${user.name} (${user.email})`,
      hotelId: user.hotelId,
      departmentId: user.departmentId,
    });
    res.json(user);
  })
);

// Lifting a sign-in lockout early is reserved for Admins: a lock usually means
// someone has been guessing the password, so it shouldn't be routine to clear.
usersRouter.post(
  "/:id/unlock",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "User not found" });

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { failedLoginCount: 0, lockedUntil: null },
      select: publicSelect,
    });
    await audit(req, {
      action: "user.unlocked",
      entityId: user.id,
      summary: `Unlocked sign-in for ${user.name} (${user.email})`,
      hotelId: user.hotelId,
      departmentId: user.departmentId,
    });
    res.json(user);
  })
);
