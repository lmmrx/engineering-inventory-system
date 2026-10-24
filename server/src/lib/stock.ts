export const DAY_MS = 24 * 60 * 60 * 1000;

export type StockStatus = "out" | "low" | "over" | "healthy";

/** The single definition of an item's stock state, shared by the dashboard and reports. */
export function stockStatus(item: { quantityOnHand: number; reorderPoint: number; maxLevel: number | null }): StockStatus {
  if (item.quantityOnHand === 0) return "out";
  if (item.quantityOnHand <= item.reorderPoint) return "low";
  if (item.maxLevel != null && item.quantityOnHand > item.maxLevel) return "over";
  return "healthy";
}
