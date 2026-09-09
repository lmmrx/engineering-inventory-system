import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, requireRole, resolveDepartmentScope, resolveHotelScope } from "../middleware/auth";

export const itemsRouter = Router();

itemsRouter.use(requireAuth);

itemsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const hotelId = resolveHotelScope(req);
    const departmentId = resolveDepartmentScope(req);
    const { categoryId, lowStockOnly } = req.query;

    const items = await prisma.inventoryItem.findMany({
      where: {
        hotelId,
        departmentId,
        categoryId: typeof categoryId === "string" ? categoryId : undefined,
      },
      include: { category: true, hotel: true },
      orderBy: { name: "asc" },
    });

    const result = lowStockOnly === "true" ? items.filter((i) => i.quantityOnHand <= i.reorderPoint) : items;
    res.json(result);
  })
);

itemsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id },
      include: { category: true, hotel: true },
    });
    if (!item) return res.status(404).json({ error: "Item not found" });

    const hotelId = resolveHotelScope(req);
    if (hotelId && item.hotelId !== hotelId) return res.status(403).json({ error: "Forbidden" });

    const departmentId = resolveDepartmentScope(req);
    if (departmentId && item.departmentId !== departmentId) return res.status(403).json({ error: "Forbidden" });

    res.json(item);
  })
);

const upsertSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  unit: z.string().min(1).default("ea"),
  quantityOnHand: z.number().int().min(0).default(0),
  reorderPoint: z.number().int().min(0).default(0),
  maxLevel: z.number().int().min(0).nullable().optional(),
  unitCost: z.number().min(0).nullable().optional(),
  location: z.string().optional(),
  hotelId: z.string().min(1),
  departmentId: z.string().min(1),
  categoryId: z.string().min(1),
});

itemsRouter.post(
  "/",
  requireRole("ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    if (req.user!.role === "MANAGER") {
      if (parsed.data.hotelId !== req.user!.hotelId) {
        return res.status(403).json({ error: "Managers may only add items to their own hotel" });
      }
      if (parsed.data.departmentId !== req.user!.departmentId) {
        return res.status(403).json({ error: "Managers may only add items to their own department" });
      }
    }

    if (parsed.data.sku) {
      const duplicate = await prisma.inventoryItem.findUnique({
        where: { hotelId_sku: { hotelId: parsed.data.hotelId, sku: parsed.data.sku } },
      });
      if (duplicate) {
        return res.status(409).json({ error: "An item with this SKU already exists at this hotel" });
      }
    }

    const item = await prisma.inventoryItem.create({ data: parsed.data });
    res.status(201).json(item);
  })
);

itemsRouter.patch(
  "/:id",
  requireRole("ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Item not found" });

    if (req.user!.role === "MANAGER") {
      if (existing.hotelId !== req.user!.hotelId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      // Prevent a Manager from re-homing an item to a hotel or department they don't run.
      if (parsed.data.hotelId && parsed.data.hotelId !== req.user!.hotelId) {
        return res.status(403).json({ error: "Managers may not move items to another hotel" });
      }
      if (parsed.data.departmentId && parsed.data.departmentId !== req.user!.departmentId) {
        return res.status(403).json({ error: "Managers may not move items to another department" });
      }
    }

    if (parsed.data.sku) {
      const duplicate = await prisma.inventoryItem.findUnique({
        where: {
          hotelId_sku: { hotelId: parsed.data.hotelId ?? existing.hotelId, sku: parsed.data.sku },
        },
      });
      if (duplicate && duplicate.id !== existing.id) {
        return res.status(409).json({ error: "An item with this SKU already exists at this hotel" });
      }
    }

    const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(item);
  })
);
