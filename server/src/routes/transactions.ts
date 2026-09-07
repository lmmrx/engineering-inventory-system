import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, resolveHotelScope } from "../middleware/auth";

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);

transactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const hotelId = resolveHotelScope(req);
    const { itemId } = req.query;

    const transactions = await prisma.stockTransaction.findMany({
      where: {
        itemId: typeof itemId === "string" ? itemId : undefined,
        item: hotelId ? { hotelId } : undefined,
      },
      include: {
        item: { include: { hotel: true } },
        performedBy: { select: { id: true, name: true } },
        workOrder: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(transactions);
  })
);

const createSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["RECEIVE", "ISSUE", "ADJUSTMENT"]),
  quantity: z.number().int(),
  notes: z.string().optional(),
  workOrderId: z.string().optional(),
  purchaseRequestId: z.string().optional(),
});

transactionsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { itemId, type, quantity, notes, workOrderId, purchaseRequestId } = parsed.data;

  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const hotelId = resolveHotelScope(req);
  if (hotelId && item.hotelId !== hotelId) return res.status(403).json({ error: "Forbidden" });

  if (workOrderId) {
    const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!workOrder || workOrder.hotelId !== item.hotelId) {
      return res.status(400).json({ error: "Work order does not belong to this item's hotel" });
    }
  }
  if (purchaseRequestId) {
    const purchaseRequest = await prisma.purchaseRequest.findUnique({ where: { id: purchaseRequestId } });
    if (!purchaseRequest || purchaseRequest.hotelId !== item.hotelId) {
      return res.status(400).json({ error: "Purchase request does not belong to this item's hotel" });
    }
  }

  // RECEIVE and ISSUE take a positive quantity and move stock up/down by that amount.
  // ADJUSTMENT takes a signed delta (e.g. -2 to correct a miscount).
  let delta: number;
  if (type === "RECEIVE") delta = Math.abs(quantity);
  else if (type === "ISSUE") delta = -Math.abs(quantity);
  else delta = quantity;

  const newQuantity = item.quantityOnHand + delta;
  if (newQuantity < 0) {
    return res.status(400).json({ error: "Transaction would result in negative stock" });
  }

  const [, transaction] = await prisma.$transaction([
    prisma.inventoryItem.update({ where: { id: itemId }, data: { quantityOnHand: newQuantity } }),
    prisma.stockTransaction.create({
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
    }),
  ]);

  res.status(201).json(transaction);
  })
);
