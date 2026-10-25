import { Request, Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { audit, created, diff } from "../lib/audit";
import { passwordSchema } from "../lib/password";
import { GRANTABLE, Permission, ROLE_RANK, roleDefaults } from "../lib/permissions";
import { NO_SCOPE, requireAuth, requirePermission, requireRole } from "../middleware/auth";

export const usersRouter = Router();

// Admins manage everyone; Managers and Supervisors manage the roles below
// theirs, in their own hotel and department only.
usersRouter.use(requireAuth, requirePermission("manage_staff"));

const ROLES = ["ADMIN", "MANAGER", "SUPERVISOR", "STAFF"] as const;

const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  hotelId: true,
  departmentId: true,
  position: true,
  createdAt: true,
  disabledAt: true,
  lockedUntil: true,
  mustChangePassword: true,
  extraPermissions: true,
  manager: { select: { id: true, name: true } },
} as const;

const isAdmin = (req: Request) => req.user!.role === "ADMIN";

/** Whether the signed-in user may create or manage an account with this role in this hotel and department. */
function mayManage(req: Request, target: { role: Role; hotelId: string | null; departmentId: string | null }) {
  if (isAdmin(req)) return true;
  const me = req.user!;
  return (
    ROLE_RANK[target.role] < ROLE_RANK[me.role] && target.hotelId === me.hotelId && target.departmentId === me.departmentId
  );
}

usersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    // Below Admin, people only ever see their own hotel and department.
    const where = isAdmin(req)
      ? {}
      : { hotelId: req.user!.hotelId ?? NO_SCOPE, departmentId: req.user!.departmentId ?? NO_SCOPE };
    const users = await prisma.user.findMany({ where, select: publicSelect, orderBy: { name: "asc" } });
    res.json(users);
  })
);

/**
 * Who can be someone's manager: an active Admin, or an active Manager or
 * Supervisor at the same hotel — always ranked above the person themselves.
 */
async function managerCandidates(role: Role, hotelId: string | null, excludeId?: string) {
  const people = await prisma.user.findMany({
    where: {
      disabledAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [{ role: "ADMIN" }, ...(hotelId ? [{ role: { in: ["MANAGER", "SUPERVISOR"] as Role[] }, hotelId }] : [])],
    },
    select: { id: true, name: true, role: true },
  });
  return people
    .filter((p) => ROLE_RANK[p.role] > ROLE_RANK[role])
    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name));
}

const optionsSchema = z.object({
  role: z.enum(ROLES),
  hotelId: z.string().max(64).optional(),
  excludeId: z.string().max(64).optional(),
});

// The Manager dropdown in the add/edit user forms.
usersRouter.get(
  "/manager-options",
  asyncHandler(async (req, res) => {
    const parsed = optionsSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    // Below Admin, accounts are only ever created in your own hotel.
    const hotelId = isAdmin(req) ? parsed.data.hotelId ?? null : req.user!.hotelId;
    const candidates = await managerCandidates(parsed.data.role, hotelId, parsed.data.excludeId);
    res.json(candidates.map(({ id, name }) => ({ id, name })));
  })
);

/** Checks a chosen manager is allowed for this account; returns an error message if not. */
async function invalidManager(managerId: string | null | undefined, role: Role, hotelId: string | null, userId?: string) {
  if (!managerId) return null;
  const candidates = await managerCandidates(role, hotelId, userId);
  return candidates.some((c) => c.id === managerId)
    ? null
    : "The manager must be an Admin, or a Manager or Supervisor at this hotel ranked above this person";
}

const permissionList = z.array(z.enum(GRANTABLE as [Permission, ...Permission[]])).max(GRANTABLE.length);

/**
 * The extras to store after a change. You can only grant or remove what you
 * have yourself; extras you don't hold (e.g. granted by an Admin) are kept.
 * Anything the role already includes isn't stored as an extra.
 */
function nextExtras(req: Request, requested: Permission[], existing: string[], role: Role) {
  const mine = new Set<string>(req.user!.permissions);
  const kept = existing.filter((p) => !mine.has(p));
  const granted = requested.filter((p) => mine.has(p));
  const defaults = new Set<string>(roleDefaults(role));
  return [...new Set([...kept, ...granted])].filter((p) => (GRANTABLE as string[]).includes(p) && !defaults.has(p)).sort();
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().max(254).email(),
  password: passwordSchema,
  role: z.enum(ROLES),
  hotelId: z.string().max(64).nullable().optional(),
  departmentId: z.string().max(64).nullable().optional(),
  managerId: z.string().max(64).min(1).nullable().optional(),
  position: z.string().trim().max(100).optional(),
  extraPermissions: permissionList.optional(),
});

usersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const data = parsed.data;
    const hotelId = data.role === "ADMIN" ? null : data.hotelId ?? null;
    const departmentId = data.departmentId ?? null;

    if (!mayManage(req, { role: data.role, hotelId, departmentId })) {
      return res.status(403).json({ error: "You can only create accounts ranked below yours, in your own hotel and department" });
    }
    if (data.role !== "ADMIN" && (!hotelId || !departmentId)) {
      return res.status(400).json({ error: "Everyone except Admins needs both a hotel and a department" });
    }
    const managerError = await invalidManager(data.managerId, data.role, hotelId);
    if (managerError) return res.status(400).json({ error: managerError });

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
        hotelId,
        departmentId,
        managerId: data.managerId ?? null,
        position: data.position || null,
        extraPermissions: nextExtras(req, data.extraPermissions ?? [], [], data.role),
        // The creator knows this password, so it's only good for the first sign-in.
        mustChangePassword: true,
      },
      select: publicSelect,
    });
    const changes = await created({ ...user, managerId: user.manager?.id ?? null }, [
      "name",
      "email",
      "role",
      "hotelId",
      "departmentId",
      "managerId",
      "position",
    ]);
    if (user.extraPermissions.length > 0) changes.extraPermissions = { from: null, to: user.extraPermissions.join(", ") };
    await audit(req, {
      action: "user.created",
      entityId: user.id,
      summary: `Created user ${user.name} (${user.email}) as ${user.role}`,
      changes,
      hotelId: user.hotelId,
      departmentId: user.departmentId,
    });
    res.status(201).json(user);
  })
);

/** Loads the target user and checks the signed-in user may manage them. */
async function loadManageable(req: Request): Promise<{ user: User } | { status: number; error: string }> {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return { status: 404, error: "User not found" };
  if (!mayManage(req, user)) return { status: 403, error: "Forbidden" };
  return { user };
}

/** Whether removing this user's admin access would leave no active Admin to manage the system. */
async function isLastActiveAdmin(user: User) {
  if (user.role !== "ADMIN" || user.disabledAt) return false;
  const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", disabledAt: null } });
  return activeAdmins <= 1;
}

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ROLES).optional(),
  hotelId: z.string().max(64).nullable().optional(),
  departmentId: z.string().max(64).nullable().optional(),
  managerId: z.string().max(64).min(1).nullable().optional(),
  position: z.string().trim().max(100).optional(),
  extraPermissions: permissionList.optional(),
  password: passwordSchema.optional(),
});

usersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const input = parsed.data;

    const loaded = await loadManageable(req);
    if ("error" in loaded) return res.status(loaded.status).json({ error: loaded.error });
    const existing = loaded.user;

    const role = input.role ?? existing.role;
    const hotelId = role === "ADMIN" ? null : input.hotelId !== undefined ? input.hotelId : existing.hotelId;
    const departmentId = input.departmentId !== undefined ? input.departmentId : existing.departmentId;

    // The account must still be one you're allowed to manage after the change:
    // no promoting to your own rank or above, no moving it out of your scope.
    if (!mayManage(req, { role, hotelId, departmentId })) {
      return res.status(403).json({ error: "You can only give roles below yours, in your own hotel and department" });
    }
    if (input.role && input.role !== "ADMIN" && (await isLastActiveAdmin(existing))) {
      return res.status(400).json({ error: "This is the only active Admin — make someone else an Admin first" });
    }
    if (role !== "ADMIN" && (!hotelId || !departmentId)) {
      return res.status(400).json({ error: "Everyone except Admins needs both a hotel and a department" });
    }

    // A manager chosen now must fit; an existing one that no longer fits
    // (e.g. after a move to another hotel) is cleared.
    let managerId = input.managerId !== undefined ? input.managerId : existing.managerId;
    if (input.managerId !== undefined) {
      const managerError = await invalidManager(managerId, role, hotelId, existing.id);
      if (managerError) return res.status(400).json({ error: managerError });
    } else if (managerId && (await invalidManager(managerId, role, hotelId, existing.id))) {
      managerId = null;
    }

    const data: Record<string, unknown> = {
      name: input.name,
      role,
      hotelId,
      departmentId,
      managerId,
      position: input.position === undefined ? undefined : input.position || null,
      extraPermissions: nextExtras(req, input.extraPermissions ?? existing.extraPermissions as Permission[], existing.extraPermissions, role),
    };
    if (input.password) {
      // The resetter knows the new password, so the user must replace it, and
      // any session that knew the old one is signed out.
      data.passwordHash = await bcrypt.hash(input.password, 10);
      data.mustChangePassword = true;
      data.passwordChangedAt = new Date();
      data.tokenVersion = { increment: 1 };
    }

    const user = await prisma.user.update({ where: { id: existing.id }, data, select: publicSelect });

    const changes = await diff(existing, { ...existing, ...user, managerId: user.manager?.id ?? null }, [
      "name",
      "role",
      "hotelId",
      "departmentId",
      "managerId",
      "position",
    ]);
    const before = existing.extraPermissions.join(", ");
    const after = user.extraPermissions.join(", ");
    if (before !== after) changes.extraPermissions = { from: before || null, to: after || null };
    // Never log the password itself — only that it was reset.
    if (input.password) changes.password = { from: null, to: "reset" };
    if (Object.keys(changes).length > 0) {
      await audit(req, {
        action: "user.updated",
        entityId: user.id,
        summary: changes.role
          ? `Changed ${user.name}'s role from ${existing.role} to ${user.role}`
          : changes.extraPermissions && Object.keys(changes).length === 1
          ? `Changed extra permissions for ${user.name}`
          : input.password && Object.keys(changes).length === 1
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
