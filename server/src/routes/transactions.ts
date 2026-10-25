import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { outOfScope, requireAuth, resolveDepartmentScope, resolveHotelScope } from "../middleware/auth";

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);

transactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const hotelId = resolveHotelScope(req);
    const departmentId = resolveDepartmentScope(req);
    const { itemId } = req.query;
    // The dashboard only shows the latest few; the default suits a full list.
    const requested = Number(req.query.limit);
    const take = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 200) : 200;

    const transactions = await prisma.stockTransaction.findMany({
      where: {
        itemId: typeof itemId === "string" ? itemId : undefined,
        item: hotelId || departmentId ? { hotelId, departmentId } : undefined,
      },
      include: {
        item: { include: { hotel: true } },
        performedBy: { select: { id: true, name: true } },
        workOrder: true,
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    res.json(transactions);
  })
);

const createSchema = z.object({
  itemId: z.string().max(64).min(1),
  type: z.enum(["RECEIVE", "ISSUE", "ADJUSTMENT"]),
  // Bounded so a typo can't overflow the stock column (a 32-bit integer).
  quantity: z.number().int().min(-1_000_000).max(1_000_000).refine((q) => q !== 0, "Quantity can't be zero"),
  notes: z.string().trim().max(2000).optional(),
  workOrderId: z.string().max(64).optional(),
  purchaseRequestId: z.string().max(64).optional(),
});

transactionsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { itemId, type, quantity, notes, workOrderId, purchaseRequestId } = parsed.data;

  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) return res.status(404).json({ error: "Item not found" });

  if (outOfScope(req, item)) return res.status(403).json({ error: "Forbidden" });

  if (workOrderId) {
    const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!workOrder || workOrder.hotelId !== item.hotelId || workOrder.departmentId !== item.departmentId) {
      return res.status(400).json({ error: "Work order does not belong to this item's hotel and department" });
    }
  }
  if (purchaseRequestId) {
    const purchaseRequest = await prisma.purchaseRequest.findUnique({ where: { id: purchaseRequestId } });
    if (!purchaseRequest || purchaseRequest.hotelId !== item.hotelId || purchaseRequest.departmentId !== item.departmentId) {
      return res.status(400).json({ error: "Purchase request does not belong to this item's hotel and department" });
    }
  }

  // RECEIVE and ISSUE take a positive quantity and move stock up/down by that amount.
  // ADJUSTMENT takes a signed delta (e.g. -2 to correct a miscount).
  let delta: number;
  if (type === "RECEIVE") delta = Math.abs(quantity);
  else if (type === "ISSUE") delta = -Math.abs(quantity);
  else delta = quantity;

  // Applied as an increment guarded by the current stock, so two people issuing
  // the same item at once can't overwrite each other or drive it below zero.
  const transaction = await prisma.$transaction(async (tx) => {
    const { count } = await tx.inventoryItem.updateMany({
      where: { id: itemId, quantityOnHand: { gte: -delta } },
      data: { quantityOnHand: { increment: delta } },
    });
    if (count === 0) return null;
    return tx.stockTransaction.create({
      data: {
        itemId,
        type,
        quantity: delta,
        notes,
        performedByUserId: req.user!.userId,
        workOrderId,
        purchaseRequestId,
      },
      include: { item: true },
    });
  });
  if (!transaction) {
    return res.status(400).json({ error: "Transaction would result in negative stock" });
  }

  res.status(201).json(transaction);
  })
);
