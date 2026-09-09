import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole("ADMIN", "MANAGER"));

usersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    // A Manager is the admin for exactly one (hotel, department) pair — they
    // only ever see users in that same pair, never other departments at
    // their own hotel or other hotels in their own department.
    const where =
      req.user!.role === "MANAGER"
        ? { hotelId: req.user!.hotelId ?? undefined, departmentId: req.user!.departmentId ?? undefined }
        : {};
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        hotelId: true,
        departmentId: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
    res.json(users);
  })
);

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
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

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
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
      },
      select: { id: true, name: true, email: true, role: true, hotelId: true, departmentId: true },
    });
    res.status(201).json(user);
  })
);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "MANAGER", "STAFF"]).optional(),
  hotelId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  password: z.string().min(8).optional(),
});

usersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "User not found" });

    if (req.user!.role === "MANAGER") {
      // A Manager is the admin for their own (hotel, department) pair only —
      // they may only touch Staff already inside that pair, may not move
      // anyone out of it, and may not hand out Manager/Admin privileges.
      if (existing.role !== "STAFF" || existing.hotelId !== req.user!.hotelId || existing.departmentId !== req.user!.departmentId) {
        return res.status(403).json({ error: "Forbidden" });
      }
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

    const { password, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (password) data.passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, email: true, role: true, hotelId: true, departmentId: true },
    });
    res.json(user);
  })
);
