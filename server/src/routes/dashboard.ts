import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { DAY_MS, USAGE_WINDOW_DAYS, dailyUsage, recentIssuedByItem, stockStatus } from "../lib/stock";
import { requireAuth, resolveDepartmentScope, resolveHotelScope } from "../middleware/auth";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

// Work orders open longer than this are called out as stale.
const STALE_WORK_ORDER_DAYS = 7;
const RUNNING_OUT_LIMIT = 8;

/**
 * Everything the dashboard needs in one round trip, aggregated server-side so
 * the numbers stay correct no matter how many transactions exist (the
 * /transactions list is capped at the latest 200).
 */
dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const hotelId = resolveHotelScope(req);
    const departmentId = resolveDepartmentScope(req);
    const now = Date.now();
    const staleBefore = new Date(now - STALE_WORK_ORDER_DAYS * DAY_MS);

    const [items, issuedQty, openWorkOrders, staleWorkOrders, pendingPurchaseRequests] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { hotelId, departmentId },
        select: {
          id: true,
          name: true,
          unit: true,
          quantityOnHand: true,
          reorderPoint: true,
          maxLevel: true,
          unitCost: true,
          createdAt: true,
          hotel: { select: { code: true } },
        },
      }),
      recentIssuedByItem(hotelId || departmentId ? { hotelId, departmentId } : undefined, now),
      prisma.workOrder.count({ where: { hotelId, departmentId, status: { not: "COMPLETED" } } }),
      prisma.workOrder.count({
        where: { hotelId, departmentId, status: { not: "COMPLETED" }, createdAt: { lt: staleBefore } },
      }),
      prisma.purchaseRequest.count({ where: { hotelId, departmentId, status: "PENDING" } }),
    ]);

    const health = { out: 0, low: 0, healthy: 0, over: 0 };
    let stockValue = 0;
    let itemsWithCost = 0;
    const runningOut = [];

    for (const item of items) {
      health[stockStatus(item)]++;

      if (item.unitCost != null) {
        itemsWithCost++;
        stockValue += Number(item.unitCost) * item.quantityOnHand;
      }

      const issued = issuedQty.get(item.id) ?? 0;
      if (issued > 0) {
        const usage = dailyUsage(issued, item.createdAt, now);
        runningOut.push({
          id: item.id,
          name: item.name,
          unit: item.unit,
          hotelCode: item.hotel.code,
          quantityOnHand: item.quantityOnHand,
          reorderPoint: item.reorderPoint,
          dailyUsage: Math.round(usage * 10) / 10,
          daysOfCover: Math.floor(item.quantityOnHand / usage),
        });
      }
    }

    runningOut.sort((a, b) => a.daysOfCover - b.daysOfCover);

    res.json({
      usageWindowDays: USAGE_WINDOW_DAYS,
      itemCount: items.length,
      stockValue: { total: Math.round(stockValue * 100) / 100, itemsWithCost },
      health,
      openWorkOrders: { total: openWorkOrders, stale: staleWorkOrders, staleAfterDays: STALE_WORK_ORDER_DAYS },
      pendingPurchaseRequests,
      runningOut: runningOut.slice(0, RUNNING_OUT_LIMIT),
    });
  })
);
