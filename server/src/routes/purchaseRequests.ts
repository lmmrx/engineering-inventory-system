import { Request, Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { audit, recordRef } from "../lib/audit";
import { outOfScope, requireAuth, requirePermission, resolveDepartmentScope, resolveHotelScope } from "../middleware/auth";

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
  hotelId: z.string().max(64).min(1),
  departmentId: z.string().max(64).min(1),
  notes: z.string().trim().max(2000).optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().max(64).min(1),
        quantityRequested: z.number().int().positive().max(1_000_000),
        // The column holds up to 99,999,999.99.
        estimatedCost: z.number().min(0).max(10_000_000).optional(),
      })
    )
    .min(1)
    .max(100),
});

purchaseRequestsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    if (outOfScope(req, parsed.data)) return res.status(403).json({ error: "Forbidden" });

    // The same item may appear on more than one line, so compare distinct ids.
    const itemIds = [...new Set(parsed.data.items.map((i) => i.itemId))];
    const items = await prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } });
    const invalid = items.find(
      (i) => i.hotelId !== parsed.data.hotelId || i.departmentId !== parsed.data.departmentId
    );
    if (items.length !== itemIds.length || invalid) {
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
    await audit(req, {
      action: "purchase_request.created",
      entityId: purchaseRequest.id,
      summary: `Requested ${purchaseRequest.items
        .map((line) => `${line.quantityRequested} ${line.item.unit} ${line.item.name}`)
        .join(", ")} (${recordRef("PR", purchaseRequest.id)})`,
      hotelId: purchaseRequest.hotelId,
      departmentId: purchaseRequest.departmentId,
    });
    res.status(201).json(purchaseRequest);
  })
);

async function loadInScope(req: Request, id: string) {
  const purchaseRequest = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!purchaseRequest) return { error: 404 as const };
  if (outOfScope(req, purchaseRequest)) return { error: 403 as const };
  return { purchaseRequest };
}

/**
 * Moves a still-pending request to APPROVED or REJECTED. The status check is
 * part of the update itself, so a request can't be decided twice — e.g.
 * re-approving a RECEIVED request would let it be received (and stocked) again.
 */
async function decide(id: string, status: "APPROVED" | "REJECTED", userId: string) {
  const { count } = await prisma.purchaseRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status, approvedByUserId: userId, decidedAt: new Date() },
  });
  return count === 0 ? null : prisma.purchaseRequest.findUniqueOrThrow({ where: { id } });
}

purchaseRequestsRouter.patch(
  "/:id/approve",
  requirePermission("approve_requests"),
  asyncHandler(async (req, res) => {
    const result = await loadInScope(req, req.params.id);
    if (result.error === 404) return res.status(404).json({ error: "Purchase request not found" });
    if (result.error === 403) return res.status(403).json({ error: "Forbidden" });
    // Someone else has to approve a request — except an Admin, the last resort.
    if (result.purchaseRequest!.requestedByUserId === req.user!.userId && req.user!.role !== "ADMIN") {
      return res.status(403).json({ error: "You can't approve your own purchase request — ask someone else to" });
    }

    const purchaseRequest = await decide(req.params.id, "APPROVED", req.user!.userId);
    if (!purchaseRequest) return res.status(409).json({ error: "Only pending purchase requests can be approved" });
    await audit(req, {
      action: "purchase_request.approved",
      entityId: purchaseRequest.id,
      summary: `Approved purchase request ${recordRef("PR", purchaseRequest.id)}`,
      changes: { status: { from: result.purchaseRequest!.status, to: purchaseRequest.status } },
      hotelId: purchaseRequest.hotelId,
      departmentId: purchaseRequest.departmentId,
    });
    res.json(purchaseRequest);
  })
);

purchaseRequestsRouter.patch(
  "/:id/reject",
  requirePermission("approve_requests"),
  asyncHandler(async (req, res) => {
    const result = await loadInScope(req, req.params.id);
    if (result.error === 404) return res.status(404).json({ error: "Purchase request not found" });
    if (result.error === 403) return res.status(403).json({ error: "Forbidden" });

    const purchaseRequest = await decide(req.params.id, "REJECTED", req.user!.userId);
    if (!purchaseRequest) return res.status(409).json({ error: "Only pending purchase requests can be rejected" });
    await audit(req, {
      action: "purchase_request.rejected",
      entityId: purchaseRequest.id,
      summary: `Rejected purchase request ${recordRef("PR", purchaseRequest.id)}`,
      changes: { status: { from: result.purchaseRequest!.status, to: purchaseRequest.status } },
      hotelId: purchaseRequest.hotelId,
      departmentId: purchaseRequest.departmentId,
    });
    res.json(purchaseRequest);
  })
);

const receiveSchema = z.object({
  items: z
    .array(z.object({ purchaseRequestItemId: z.string().max(64).min(1), quantityReceived: z.number().int().min(0).max(1_000_000) }))
    .min(1)
    .max(100),
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

    if (outOfScope(req, purchaseRequest)) return res.status(403).json({ error: "Forbidden" });

    if (purchaseRequest.status !== "APPROVED") {
      return res.status(400).json({ error: "Only approved purchase requests can be received" });
    }

    // Each line counts once, even if the body repeats it.
    const lines = new Map<string, number>();
    for (const line of parsed.data.items) {
      if (line.quantityReceived > 0 && purchaseRequest.items.some((i) => i.id === line.purchaseRequestItemId)) {
        lines.set(line.purchaseRequestItemId, line.quantityReceived);
      }
    }

    const alreadyReceived = await prisma.$transaction(async (tx) => {
      // Claim the request first: of two simultaneous submissions only one
      // finds it still APPROVED, so stock can't be received twice.
      const { count } = await tx.purchaseRequest.updateMany({
        where: { id: purchaseRequest.id, status: "APPROVED" },
        data: { status: "RECEIVED", receivedAt: new Date() },
      });
      if (count === 0) return true;

      for (const [prItemId, quantityReceived] of lines) {
        const prItem = purchaseRequest.items.find((i) => i.id === prItemId)!;
        await tx.inventoryItem.update({
          where: { id: prItem.itemId },
          data: { quantityOnHand: { increment: quantityReceived } },
        });
        await tx.stockTransaction.create({
          data: {
            itemId: prItem.itemId,
            type: "RECEIVE",
            quantity: quantityReceived,
            performedByUserId: req.user!.userId,
            purchaseRequestId: purchaseRequest.id,
            notes: "Received from purchase request",
          },
        });
        await tx.purchaseRequestItem.update({
          where: { id: prItem.id },
          data: { quantityReceived: { increment: quantityReceived } },
        });
      }
      return false;
    }, { timeout: 20_000 });
    if (alreadyReceived) {
      return res.status(409).json({ error: "This purchase request has already been received" });
    }

    const updated = await prisma.purchaseRequest.findUnique({
      where: { id: purchaseRequest.id },
      include: { items: { include: { item: true } } },
    });
    const received = updated!.items.filter((line) => line.quantityReceived > 0);
    await audit(req, {
      action: "purchase_request.received",
      entityId: purchaseRequest.id,
      summary: `Received purchase request ${recordRef("PR", purchaseRequest.id)}: ${
        received.length > 0
          ? received.map((line) => `${line.quantityReceived}/${line.quantityRequested} ${line.item.name}`).join(", ")
          : "nothing received"
      }`,
      changes: { status: { from: purchaseRequest.status, to: "RECEIVED" } },
      hotelId: purchaseRequest.hotelId,
      departmentId: purchaseRequest.departmentId,
    });
    res.json(updated);
  })
);
