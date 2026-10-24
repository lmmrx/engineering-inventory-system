import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { DAY_MS, stockStatus } from "../lib/stock";
import { loadOutlooks } from "../lib/usage";
import { requireAuth, resolveDepartmentScope, resolveHotelScope } from "../middleware/auth";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

// Work orders open longer than this are called out as stale.
const STALE_WORK_ORDER_DAYS = 7;
const RUNNING_OUT_LIMIT = 8;

const MY_TOP_ITEMS = 6;
const MY_RECENT = 10;
const UP_FOR_GRABS = 10;

/**
 * The Staff dashboard: the signed-in user's own work, in one round trip.
 * Everything stays inside their hotel and department.
 */
dashboardRouter.get(
  "/my-work",
  asyncHandler(async (req, res) => {
    const hotelId = resolveHotelScope(req);
    const departmentId = resolveDepartmentScope(req);
    const userId = req.user!.userId;
    const now = Date.now();
    const workOrderSelect = {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      hotel: { select: { code: true } },
    } as const;

    const [assigned, upForGrabs, completedThisWeek, myIssues, recent] = await Promise.all([
      // Oldest first: the longest-waiting job is the one to do next.
      prisma.workOrder.findMany({
        where: { hotelId, departmentId, assignedToUserId: userId, status: { not: "COMPLETED" } },
        select: workOrderSelect,
        orderBy: { createdAt: "asc" },
      }),
      prisma.workOrder.findMany({
        where: { hotelId, departmentId, assignedToUserId: null, status: { not: "COMPLETED" } },
        select: workOrderSelect,
        orderBy: { createdAt: "asc" },
        take: UP_FOR_GRABS,
      }),
      prisma.workOrder.count({
        where: { hotelId, departmentId, assignedToUserId: userId, completedAt: { gte: new Date(now - 7 * DAY_MS) } },
      }),
      prisma.stockTransaction.groupBy({
        by: ["itemId"],
        where: {
          performedByUserId: userId,
          type: "ISSUE",
          createdAt: { gte: new Date(now - 30 * DAY_MS) },
          item: { hotelId, departmentId },
        },
        _sum: { quantity: true },
      }),
      prisma.stockTransaction.findMany({
        where: { performedByUserId: userId, item: { hotelId, departmentId } },
        select: { id: true, type: true, quantity: true, createdAt: true, item: { select: { name: true, unit: true } } },
        orderBy: { createdAt: "desc" },
        take: MY_RECENT,
      }),
    ]);

    // ISSUE quantities are stored as negative, so the smallest sum is the most used.
    const top = myIssues
      .sort((a, b) => (a._sum.quantity ?? 0) - (b._sum.quantity ?? 0))
      .slice(0, MY_TOP_ITEMS);
    const topDetails = await prisma.inventoryItem.findMany({
      where: { id: { in: top.map((t) => t.itemId) } },
      select: { id: true, name: true, unit: true, quantityOnHand: true, reorderPoint: true, maxLevel: true },
    });
    const detailById = new Map(topDetails.map((i) => [i.id, i]));

    res.json({
      assigned,
      upForGrabs,
      completedThisWeek,
      topItems: top.flatMap((t) => {
        const item = detailById.get(t.itemId);
        return item
          ? [
              {
                id: item.id,
                name: item.name,
                unit: item.unit,
                quantityOnHand: item.quantityOnHand,
                reorderPoint: item.reorderPoint,
                status: stockStatus(item),
                issuedLast30Days: -(t._sum.quantity ?? 0),
              },
            ]
          : [];
      }),
      recent,
    });
  })
);

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

    const [items, openWorkOrders, staleWorkOrders, pendingPurchaseRequests] = await Promise.all([
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
      prisma.workOrder.count({ where: { hotelId, departmentId, status: { not: "COMPLETED" } } }),
      prisma.workOrder.count({
        where: { hotelId, departmentId, status: { not: "COMPLETED" }, createdAt: { lt: staleBefore } },
      }),
      prisma.purchaseRequest.count({ where: { hotelId, departmentId, status: "PENDING" } }),
    ]);

    // The same forecast as the Analytics page, so "runs out in N days" matches everywhere.
    const outlooks = await loadOutlooks(hotelId || departmentId ? { hotelId, departmentId } : undefined, items, req.query.tz);

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

      const outlook = outlooks.get(item.id);
      if (outlook) {
        runningOut.push({
          id: item.id,
          name: item.name,
          unit: item.unit,
          hotelCode: item.hotel.code,
          quantityOnHand: item.quantityOnHand,
          reorderPoint: item.reorderPoint,
          dailyUsage: Math.round(outlook.dailyRate * 10) / 10,
          // null = lasts over a year at the forecast rate.
          daysOfCover: outlook.daysLeft,
        });
      }
    }

    runningOut.sort((a, b) => (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity));

    res.json({
      itemCount: items.length,
      stockValue: { total: Math.round(stockValue * 100) / 100, itemsWithCost },
      health,
      openWorkOrders: { total: openWorkOrders, stale: staleWorkOrders, staleAfterDays: STALE_WORK_ORDER_DAYS },
      pendingPurchaseRequests,
      runningOut: runningOut.slice(0, RUNNING_OUT_LIMIT),
    });
  })
);
