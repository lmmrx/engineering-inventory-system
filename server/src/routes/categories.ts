import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    // Non-admins can only ever browse their own department's categories,
    // regardless of what departmentId they pass in the query string.
    const requested = typeof req.query.departmentId === "string" ? req.query.departmentId : undefined;
    const departmentId = req.user!.role === "ADMIN" ? requested : req.user!.departmentId ?? undefined;
    const categories = await prisma.category.findMany({
      where: { departmentId: departmentId ?? undefined },
      orderBy: { name: "asc" },
    });
    res.json(categories);
  })
);

const upsertSchema = z.object({
  name: z.string().min(1),
  departmentId: z.string().min(1),
});

categoriesRouter.post(
  "/",
  requireRole("ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    if (req.user!.role === "MANAGER" && parsed.data.departmentId !== req.user!.departmentId) {
      return res.status(403).json({ error: "Managers may only manage categories in their own department" });
    }

    const existing = await prisma.category.findUnique({
      where: { departmentId_name: { departmentId: parsed.data.departmentId, name: parsed.data.name } },
    });
    if (existing) {
      return res.status(409).json({ error: "A category with this name already exists" });
    }

    const category = await prisma.category.create({ data: parsed.data });
    res.status(201).json(category);
  })
);

categoriesRouter.patch(
  "/:id",
  requireRole("ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Category not found" });

    if (req.user!.role === "MANAGER") {
      if (existing.departmentId !== req.user!.departmentId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (parsed.data.departmentId && parsed.data.departmentId !== req.user!.departmentId) {
        return res.status(403).json({ error: "Managers may only manage categories in their own department" });
      }
    }

    if (parsed.data.name) {
      const duplicate = await prisma.category.findUnique({
        where: {
          departmentId_name: {
            departmentId: parsed.data.departmentId ?? existing.departmentId,
            name: parsed.data.name,
          },
        },
      });
      if (duplicate && duplicate.id !== existing.id) {
        return res.status(409).json({ error: "A category with this name already exists" });
      }
    }

    const category = await prisma.category.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(category);
  })
);
