import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, resolveHotelScope } from "../middleware/auth";

export const workOrdersRouter = Router();

workOrdersRouter.use(requireAuth);

workOrdersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const hotelId = resolveHotelScope(req);
    const workOrders = await prisma.workOrder.findMany({
      where: { hotelId },
      include: {
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        hotel: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(workOrders);
  })
);

workOrdersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: req.params.id },
      include: { transactions: { include: { item: true } }, createdBy: true, assignedTo: true },
    });
    if (!workOrder) return res.status(404).json({ error: "Work order not found" });

    const hotelId = resolveHotelScope(req);
    if (hotelId && workOrder.hotelId !== hotelId) return res.status(403).json({ error: "Forbidden" });

    res.json(workOrder);
  })
);

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  hotelId: z.string().min(1),
  departmentId: z.string().min(1),
  assignedToUserId: z.string().optional(),
});

workOrdersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const hotelId = resolveHotelScope(req);
    if (hotelId && parsed.data.hotelId !== hotelId) return res.status(403).json({ error: "Forbidden" });

    const workOrder = await prisma.workOrder.create({
      data: { ...parsed.data, createdByUserId: req.user!.userId },
    });
    res.status(201).json(workOrder);
  })
);

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]).optional(),
  assignedToUserId: z.string().nullable().optional(),
});

workOrdersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.workOrder.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Work order not found" });

    const hotelId = resolveHotelScope(req);
    if (hotelId && existing.hotelId !== hotelId) return res.status(403).json({ error: "Forbidden" });

    const data = { ...parsed.data } as Record<string, unknown>;
    if (parsed.data.status === "COMPLETED") data.completedAt = new Date();

    const workOrder = await prisma.workOrder.update({ where: { id: req.params.id }, data });
    res.json(workOrder);
  })
);
