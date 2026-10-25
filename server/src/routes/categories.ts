import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { audit, created, diff } from "../lib/audit";
import { NO_SCOPE, requireAuth, requirePermission } from "../middleware/auth";

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    // Non-admins can only ever browse their own department's categories,
    // regardless of what departmentId they pass in the query string.
    const requested = typeof req.query.departmentId === "string" ? req.query.departmentId : undefined;
    const departmentId = req.user!.role === "ADMIN" ? requested : req.user!.departmentId ?? NO_SCOPE;
    // Item counts show which categories are in use (and so can't be deleted).
    // Managers and Staff only count items at their own hotel.
    const itemsCounted = req.user!.role === "ADMIN" ? true : { where: { hotelId: req.user!.hotelId ?? NO_SCOPE } };
    const categories = await prisma.category.findMany({
      where: { departmentId },
      orderBy: { name: "asc" },
      include: { _count: { select: { items: itemsCounted } } },
    });
    res.json(categories.map(({ _count, ...category }) => ({ ...category, itemCount: _count.items })));
  })
);

const upsertSchema = z.object({
  name: z.string().trim().max(200).min(1),
  departmentId: z.string().max(64).min(1),
  parentId: z.string().max(64).nullable().optional(),
});

async function validateParent(parentId: string | null | undefined, departmentId: string, ownId?: string) {
  if (!parentId) return null;
  if (parentId === ownId) return "A category cannot be its own parent";
  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent || parent.departmentId !== departmentId) {
    return "Parent category must belong to the same department";
  }
  if (parent.parentId) {
    return "Categories can only be nested one level deep — pick a top-level category as the parent";
  }
  return null;
}

categoriesRouter.post(
  "/",
  requirePermission("manage_categories"),
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    if (req.user!.role !== "ADMIN" && parsed.data.departmentId !== req.user!.departmentId) {
      return res.status(403).json({ error: "You can only manage categories in your own department" });
    }

    const existing = await prisma.category.findUnique({
      where: { departmentId_name: { departmentId: parsed.data.departmentId, name: parsed.data.name } },
    });
    if (existing) {
      return res.status(409).json({ error: "A category with this name already exists" });
    }

    const parentError = await validateParent(parsed.data.parentId, parsed.data.departmentId);
    if (parentError) return res.status(400).json({ error: parentError });

    const category = await prisma.category.create({ data: parsed.data });
    await audit(req, {
      action: "category.created",
      entityId: category.id,
      summary: `Created category ${category.name}`,
      changes: await created(category, ["name", "parentId"]),
      departmentId: category.departmentId,
    });
    res.status(201).json(category);
  })
);

categoriesRouter.patch(
  "/:id",
  requirePermission("manage_categories"),
  asyncHandler(async (req, res) => {
    // A category stays in its department: moving it would leave its items and
    // subcategories filed under a category from another department.
    const parsed = upsertSchema.omit({ departmentId: true }).partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Category not found" });

    if (req.user!.role !== "ADMIN" && existing.departmentId !== req.user!.departmentId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (parsed.data.name) {
      const duplicate = await prisma.category.findUnique({
        where: { departmentId_name: { departmentId: existing.departmentId, name: parsed.data.name } },
      });
      if (duplicate && duplicate.id !== existing.id) {
        return res.status(409).json({ error: "A category with this name already exists" });
      }
    }

    if (parsed.data.parentId !== undefined) {
      const hasChildren = await prisma.category.findFirst({ where: { parentId: existing.id } });
      if (parsed.data.parentId && hasChildren) {
        return res.status(400).json({ error: "A category with subcategories can't itself become a subcategory" });
      }
      const parentError = await validateParent(parsed.data.parentId, existing.departmentId, existing.id);
      if (parentError) return res.status(400).json({ error: parentError });
    }

    const category = await prisma.category.update({ where: { id: req.params.id }, data: parsed.data });
    const changes = await diff(existing, category, ["name", "parentId"]);
    if (Object.keys(changes).length > 0) {
      await audit(req, {
        action: "category.updated",
        entityId: category.id,
        summary: `Updated category ${category.name}`,
        changes,
        departmentId: category.departmentId,
      });
    }
    res.json(category);
  })
);

categoriesRouter.delete(
  "/:id",
  requirePermission("manage_categories"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: { children: true },
    });
    if (!existing) return res.status(404).json({ error: "Category not found" });

    if (req.user!.role !== "ADMIN" && existing.departmentId !== req.user!.departmentId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const categoryIds = [existing.id, ...existing.children.map((c) => c.id)];
    const itemCount = await prisma.inventoryItem.count({ where: { categoryId: { in: categoryIds } } });
    if (itemCount > 0) {
      return res.status(409).json({
        error:
          existing.children.length > 0
            ? `Move or remove the ${itemCount} item(s) in this group and its subcategories first`
            : `Move or remove the ${itemCount} item(s) in this category first`,
      });
    }

    // Deleting a group cascades to its (now-empty) subcategories at the DB level.
    await prisma.category.delete({ where: { id: existing.id } });
    await audit(req, {
      action: "category.deleted",
      entityId: existing.id,
      summary:
        existing.children.length > 0
          ? `Deleted category group ${existing.name} and its ${existing.children.length} subcategories (${existing.children.map((c) => c.name).join(", ")})`
          : `Deleted category ${existing.name}`,
      departmentId: existing.departmentId,
    });
    res.status(204).send();
  })
);
