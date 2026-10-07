import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export const DAY_MS = 24 * 60 * 60 * 1000;
// How far back usage is averaged when projecting days of cover.
export const USAGE_WINDOW_DAYS = 30;

export type StockStatus = "out" | "low" | "over" | "healthy";

/** The single definition of an item's stock state, shared by the dashboard and reports. */
export function stockStatus(item: { quantityOnHand: number; reorderPoint: number; maxLevel: number | null }): StockStatus {
  if (item.quantityOnHand === 0) return "out";
  if (item.quantityOnHand <= item.reorderPoint) return "low";
  if (item.maxLevel != null && item.quantityOnHand > item.maxLevel) return "over";
  return "healthy";
}

/** Total quantity issued per item over the usage window, as positive numbers. */
export async function recentIssuedByItem(itemScope: Prisma.InventoryItemWhereInput | undefined, now = Date.now()) {
  const rows = await prisma.stockTransaction.groupBy({
    by: ["itemId"],
    where: { type: "ISSUE", createdAt: { gte: new Date(now - USAGE_WINDOW_DAYS * DAY_MS) }, item: itemScope },
    _sum: { quantity: true },
  });
  // ISSUE quantities are stored as negative deltas.
  return new Map(rows.map((row) => [row.itemId, -(row._sum.quantity ?? 0)]));
}

/**
 * Average daily usage over the usage window. An item added a week ago has a
 * week of history, not thirty days — averaging over the full window would
 * understate how fast it moves.
 */
export function dailyUsage(issued: number, itemCreatedAt: Date, now = Date.now()) {
  const daysTracked = Math.min(USAGE_WINDOW_DAYS, Math.max(1, (now - itemCreatedAt.getTime()) / DAY_MS));
  return issued / daysTracked;
}
