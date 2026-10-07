import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { signToken } from "../lib/auth";
import { audit } from "../lib/audit";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await audit(req, { action: "auth.login_failed", summary: `Failed sign-in for unknown email ${email}`, actorUserId: null });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await audit(req, {
        action: "auth.login_failed",
        entityId: user.id,
        summary: `Failed sign-in for ${user.email} (wrong password)`,
        actorUserId: user.id,
        hotelId: user.hotelId,
        departmentId: user.departmentId,
      });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    await audit(req, {
      action: "auth.login",
      entityId: user.id,
      summary: `${user.name} signed in`,
      actorUserId: user.id,
      hotelId: user.hotelId,
      departmentId: user.departmentId,
    });

    const token = signToken({
      userId: user.id,
      role: user.role,
      hotelId: user.hotelId,
      departmentId: user.departmentId,
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hotelId: user.hotelId,
        departmentId: user.departmentId,
      },
    });
  })
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await audit(req, {
      action: "auth.password_changed",
      entityId: user.id,
      summary: `${user.name} changed their password`,
      hotelId: user.hotelId,
      departmentId: user.departmentId,
    });

    res.json({ ok: true });
  })
);
