import { Request, Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, requireRole, resolveDepartmentScope, resolveHotelScope } from "../middleware/auth";

export const purchaseRequestsRouter = Router();

purchaseRequestsRouter.use(requireAuth);

purchaseRequestsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const hotelId = resolveHotelScope(req);
    const departmentId = resolveDepartmentScope(req);
    const purchaseRequests = await prisma.purchaseRequest.findMany({
      where: { hotelId, departmentId },
      include: {
        items: { include: { item: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        hotel: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(purchaseRequests);
  })
);

const createSchema = z.object({
  hotelId: z.string().min(1),
  departmentId: z.string().min(1),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantityRequested: z.number().int().positive(),
        estimatedCost: z.number().min(0).optional(),
      })
    )
    .min(1),
});

purchaseRequestsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const hotelId = resolveHotelScope(req);
    if (hotelId && parsed.data.hotelId !== hotelId) return res.status(403).json({ error: "Forbidden" });

    const departmentId = resolveDepartmentScope(req);
    if (departmentId && parsed.data.departmentId !== departmentId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const items = await prisma.inventoryItem.findMany({
      where: { id: { in: parsed.data.items.map((i) => i.itemId) } },
    });
    const invalid = items.find(
      (i) => i.hotelId !== parsed.data.hotelId || i.departmentId !== parsed.data.departmentId
    );
    if (items.length !== parsed.data.items.length || invalid) {
      return res.status(400).json({ error: "One or more items do not belong to this hotel and department" });
    }

    const { items: lines, ...rest } = parsed.data;
    const purchaseRequest = await prisma.purchaseRequest.create({
      data: {
        ...rest,
        requestedByUserId: req.user!.userId,
        items: { create: lines },
      },
      include: { items: { include: { item: true } } },
    });
    res.status(201).json(purchaseRequest);
  })
);

async function loadInScope(req: Request, id: string) {
  const purchaseRequest = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!purchaseRequest) return { error: 404 as const };
  const hotelId = resolveHotelScope(req);
  if (hotelId && purchaseRequest.hotelId !== hotelId) return { error: 403 as const };
  const departmentId = resolveDepartmentScope(req);
  if (departmentId && purchaseRequest.departmentId !== departmentId) return { error: 403 as const };
  return { purchaseRequest };
}

purchaseRequestsRouter.patch(
  "/:id/approve",
  requireRole("ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const result = await loadInScope(req, req.params.id);
    if (result.error === 404) return res.status(404).json({ error: "Purchase request not found" });
    if (result.error === 403) return res.status(403).json({ error: "Forbidden" });

    const purchaseRequest = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: { status: "APPROVED", approvedByUserId: req.user!.userId },
    });
    res.json(purchaseRequest);
  })
);

purchaseRequestsRouter.patch(
  "/:id/reject",
  requireRole("ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const result = await loadInScope(req, req.params.id);
    if (result.error === 404) return res.status(404).json({ error: "Purchase request not found" });
    if (result.error === 403) return res.status(403).json({ error: "Forbidden" });

    const purchaseRequest = await prisma.purchaseRequest.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", approvedByUserId: req.user!.userId },
    });
    res.json(purchaseRequest);
  })
);

const receiveSchema = z.object({
  items: z
    .array(z.object({ purchaseRequestItemId: z.string().min(1), quantityReceived: z.number().int().min(0) }))
    .min(1),
});

purchaseRequestsRouter.patch(
  "/:id/receive",
  asyncHandler(async (req, res) => {
    const parsed = receiveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const purchaseRequest = await prisma.purchaseRequest.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!purchaseRequest) return res.status(404).json({ error: "Purchase request not found" });

    const hotelId = resolveHotelScope(req);
    if (hotelId && purchaseRequest.hotelId !== hotelId) return res.status(403).json({ error: "Forbidden" });

    const departmentId = resolveDepartmentScope(req);
    if (departmentId && purchaseRequest.departmentId !== departmentId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (purchaseRequest.status !== "APPROVED") {
      return res.status(400).json({ error: "Only approved purchase requests can be received" });
    }

    const ops = [];
    for (const line of parsed.data.items) {
      const prItem = purchaseRequest.items.find((i) => i.id === line.purchaseRequestItemId);
      if (!prItem || line.quantityReceived <= 0) continue;

      ops.push(
        prisma.inventoryItem.update({
          where: { id: prItem.itemId },
          data: { quantityOnHand: { increment: line.quantityReceived } },
        })
      );
      ops.push(
        prisma.stockTransaction.create({
          data: {
            itemId: prItem.itemId,
            type: "RECEIVE",
            quantity: line.quantityReceived,
            performedByUserId: req.user!.userId,
            purchaseRequestId: purchaseRequest.id,
            notes: "Received from purchase request",
          },
        })
      );
      ops.push(
        prisma.purchaseRequestItem.update({
          where: { id: prItem.id },
          data: { quantityReceived: { increment: line.quantityReceived } },
        })
      );
    }
    ops.push(prisma.purchaseRequest.update({ where: { id: purchaseRequest.id }, data: { status: "RECEIVED" } }));

    await prisma.$transaction(ops);

    const updated = await prisma.purchaseRequest.findUnique({
      where: { id: purchaseRequest.id },
      include: { items: { include: { item: true } } },
    });
    res.json(updated);
  })
);
