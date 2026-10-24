import { Request, Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { DAY_MS } from "../lib/stock";
import {
  FORECAST_DAYS,
  capOutliers,
  daysUntilEmpty,
  forecastUsage,
  median,
  medianAbsoluteDeviation,
  suggestedReorderPoint,
} from "../lib/forecast";
import { requireAuth, requireRole, resolveDepartmentScope, resolveHotelScope } from "../middleware/auth";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, requireRole("ADMIN", "MANAGER"));

// How much history the models learn from (26 weeks).
const HISTORY_DAYS = 182;
// The window unusual activity is reported for.
const ANOMALY_WINDOW_DAYS = 30;
// No usage for this long (with stock on the shelf) counts as dead stock.
const DEAD_AFTER_DAYS = 90;
// More cover than this at the current usage rate counts as slow-moving.
const SLOW_COVER_DAYS = 180;
// Used until enough purchase requests have been received to measure it.
const ASSUMED_LEAD_TIME_DAYS = 7;
// Received purchase requests needed before a lead time counts as measured.
const MIN_LEAD_TIME_SAMPLES = 3;
// Past issues of an item needed before one can be called unusual.
const MIN_ISSUES_FOR_BASELINE = 5;
const MAX_ANOMALIES = 50;
const HISTORY_WEEKS = 8;

/**
 * Turns timestamps into whole days in the reader's time zone (sent as ?tz=),
 * so "busy Saturdays" means Saturdays where the hotel is, not in UTC.
 */
function localDays(req: Request) {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: typeof req.query.tz === "string" ? req.query.tz : "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    format = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
  }
  /** A day number (days since 1970-01-01 in local time); its weekday is (n + 4) % 7, Sunday = 0. */
  return (d: Date) => {
    const [y, m, day] = format.format(d).split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, day) / DAY_MS);
  };
}

const weekdayOf = (dayNumber: number) => (((dayNumber + 4) % 7) + 7) % 7;
const round1 = (n: number) => Math.round(n * 10) / 10;

analyticsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const hotelId = resolveHotelScope(req);
    const departmentId = resolveDepartmentScope(req);
    const itemScope = hotelId || departmentId ? { hotelId, departmentId } : undefined;
    const now = new Date();
    const dayOf = localDays(req);
    const today = dayOf(now);
    const historyStart = new Date(now.getTime() - (HISTORY_DAYS + 1) * DAY_MS);

    const [items, movements, lastIssues, receivedRequests] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { hotelId, departmentId },
        select: {
          id: true,
          name: true,
          unit: true,
          quantityOnHand: true,
          reorderPoint: true,
          unitCost: true,
          createdAt: true,
          hotel: { select: { code: true } },
        },
      }),
      prisma.stockTransaction.findMany({
        where: { item: itemScope, type: { in: ["ISSUE", "ADJUSTMENT"] }, createdAt: { gte: historyStart } },
        select: {
          id: true,
          itemId: true,
          type: true,
          quantity: true,
          notes: true,
          createdAt: true,
          performedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      // Covers usage older than the history window, for "last used" on dead stock.
      prisma.stockTransaction.groupBy({
        by: ["itemId"],
        where: { item: itemScope, type: "ISSUE" },
        _max: { createdAt: true },
      }),
      prisma.purchaseRequest.findMany({
        where: {
          hotelId,
          departmentId,
          status: "RECEIVED",
          receivedAt: { gte: new Date(now.getTime() - 365 * DAY_MS) },
        },
        select: { createdAt: true, receivedAt: true, items: { select: { itemId: true } } },
      }),
    ]);

    // --- Lead time: how long a purchase request takes from request to delivery.
    const allLeadTimes: number[] = [];
    const leadTimesByItem = new Map<string, number[]>();
    for (const pr of receivedRequests) {
      const days = (pr.receivedAt!.getTime() - pr.createdAt.getTime()) / DAY_MS;
      allLeadTimes.push(days);
      for (const line of pr.items) {
        const list = leadTimesByItem.get(line.itemId) ?? [];
        list.push(days);
        leadTimesByItem.set(line.itemId, list);
      }
    }
    const scopeLeadTime =
      allLeadTimes.length >= MIN_LEAD_TIME_SAMPLES
        ? { days: Math.max(1, round1(median(allLeadTimes))), measured: true, samples: allLeadTimes.length }
        : { days: ASSUMED_LEAD_TIME_DAYS, measured: false, samples: allLeadTimes.length };

    // --- Daily usage per item, in local days, for the history window (ending yesterday).
    const issuesByItem = new Map<string, typeof movements>();
    for (const m of movements) {
      if (m.type !== "ISSUE") continue;
      const list = issuesByItem.get(m.itemId) ?? [];
      list.push(m);
      issuesByItem.set(m.itemId, list);
    }

    const lastIssuedAt = new Map(lastIssues.map((row) => [row.itemId, row._max.createdAt]));

    const forecasts = [];
    const reorderPoints = [];
    const deadStock = [];
    const longRunRate = new Map<string, number>();

    for (const item of items) {
      // History starts when the item was added, so a new item isn't read as idle before it existed.
      const firstDay = Math.max(today - HISTORY_DAYS, dayOf(item.createdAt));
      const length = today - firstDay; // excludes today, which is still in progress
      const usage = Array(Math.max(0, length)).fill(0);
      const weekdays = usage.map((_, i) => weekdayOf(firstDay + i));
      for (const issue of issuesByItem.get(item.id) ?? []) {
        const index = dayOf(issue.createdAt) - firstDay;
        if (index >= 0 && index < length) usage[index] += -issue.quantity;
      }
      const totalUsed = usage.reduce((a, b) => a + b, 0);
      longRunRate.set(item.id, length > 0 ? totalUsed / length : 0);

      const ageDays = (now.getTime() - item.createdAt.getTime()) / DAY_MS;
      const last = lastIssuedAt.get(item.id) ?? null;
      const value = item.unitCost == null ? null : Math.round(Number(item.unitCost) * item.quantityOnHand * 100) / 100;

      // --- Dead and slow-moving stock.
      if (item.quantityOnHand > 0) {
        const idleDays = Math.floor((now.getTime() - (last ?? item.createdAt).getTime()) / DAY_MS);
        const recent = usage.slice(-DEAD_AFTER_DAYS);
        const recentRate = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
        const cover = recentRate > 0 ? Math.round(item.quantityOnHand / recentRate) : null;
        if (idleDays >= DEAD_AFTER_DAYS && ageDays >= DEAD_AFTER_DAYS) {
          deadStock.push({ ...summary(item), kind: "dead" as const, value, lastUsedAt: last, idleDays, daysOfCover: null });
        } else if (cover !== null && cover > SLOW_COVER_DAYS && ageDays >= DEAD_AFTER_DAYS) {
          deadStock.push({ ...summary(item), kind: "slow" as const, value, lastUsedAt: last, idleDays, daysOfCover: cover });
        }
      }

      if (totalUsed === 0) continue;

      // --- Demand forecast.
      const result = forecastUsage(usage, weekdays, weekdayOf(today));
      const next7 = result.daily.slice(0, 7).reduce((a, b) => a + b, 0);
      const next28 = result.daily.reduce((a, b) => a + b, 0);
      // Compared on capped usage, so one big event doesn't read as a trend.
      const typicalUsage = capOutliers(usage);
      const last28 = typicalUsage.slice(-28).reduce((a, b) => a + b, 0);
      const previous28 = usage.length >= 56 ? typicalUsage.slice(-56, -28).reduce((a, b) => a + b, 0) : null;
      const change = previous28 && previous28 > 0 ? (last28 - previous28) / previous28 : null;

      const weeklyHistory: number[] = [];
      for (let w = HISTORY_WEEKS; w >= 1; w--) {
        const end = usage.length - (w - 1) * 7;
        weeklyHistory.push(end - 7 >= 0 ? usage.slice(end - 7, end).reduce((a, b) => a + b, 0) : 0);
      }
      const weeklyForecast = [0, 1, 2, 3].map((w) => round1(result.daily.slice(w * 7, w * 7 + 7).reduce((a, b) => a + b, 0)));

      const daysLeft = daysUntilEmpty(item.quantityOnHand, result.daily);
      forecasts.push({
        ...summary(item),
        next7: round1(next7),
        next28: round1(next28),
        change: change === null ? null : Math.round(change * 100),
        daysLeft,
        runOutDate: daysLeft === null ? null : new Date(now.getTime() + daysLeft * DAY_MS),
        confidence: result.confidence,
        weeklyHistory,
        weeklyForecast,
        // Weeks of real history behind the chart; earlier weeks predate the item.
        historyWeeks: Math.min(HISTORY_WEEKS, Math.floor(usage.length / 7)),
      });

      // --- Smart reorder point (only once there's enough history to trust).
      if (result.confidence === "normal") {
        const itemLeadTimes = leadTimesByItem.get(item.id) ?? [];
        const leadTime =
          itemLeadTimes.length >= MIN_LEAD_TIME_SAMPLES
            ? { days: Math.max(1, round1(median(itemLeadTimes))), measured: true, basis: "item" as const }
            : { days: scopeLeadTime.days, measured: scopeLeadTime.measured, basis: "department" as const };
        const dailyRate = next28 / FORECAST_DAYS;
        const suggested = suggestedReorderPoint(dailyRate, result.dailyError, leadTime.days);
        const current = item.reorderPoint;
        const status =
          current < suggested * 0.8 && suggested - current >= 1
            ? ("too_low" as const)
            : current > suggested * 1.5 + 2
            ? ("too_high" as const)
            : null;
        if (status) {
          reorderPoints.push({
            ...summary(item),
            current,
            suggested,
            status,
            leadTimeDays: leadTime.days,
            leadTimeMeasured: leadTime.measured,
            leadTimeBasis: leadTime.basis,
            dailyRate: round1(dailyRate),
          });
        }
      }
    }

    // --- Unusual activity in the last ANOMALY_WINDOW_DAYS.
    const itemById = new Map(items.map((i) => [i.id, i]));
    const windowStart = now.getTime() - ANOMALY_WINDOW_DAYS * DAY_MS;
    const anomalies = [];
    const priorIssueSizes = new Map<string, number[]>();
    for (const m of movements) {
      const item = itemById.get(m.itemId);
      if (!item) continue;
      const inWindow = m.createdAt.getTime() >= windowStart;

      if (m.type === "ISSUE") {
        const size = -m.quantity;
        const prior = priorIssueSizes.get(m.itemId) ?? [];
        if (inWindow && prior.length >= MIN_ISSUES_FOR_BASELINE) {
          const typical = median(prior);
          // A robust "normal range": median plus four spreads, with a floor so
          // an item always issued in exact amounts doesn't flag every change.
          const spread = Math.max(1.4826 * medianAbsoluteDeviation(prior), 0.25 * typical, 1);
          if (size > typical + 4 * spread && size >= 2 * typical) {
            anomalies.push({
              ...movementSummary(m, item),
              kind: "large_issue" as const,
              typical: round1(typical),
              reason: `Issued ${size} ${item.unit} — usually about ${round1(typical)} at a time`,
            });
          }
        }
        prior.push(size);
        priorIssueSizes.set(m.itemId, prior);
      } else if (inWindow && m.quantity < 0) {
        // A write-down worth more than a week of normal use.
        const weekly = (longRunRate.get(m.itemId) ?? 0) * 7;
        const lost = -m.quantity;
        if (lost >= Math.max(3, weekly)) {
          anomalies.push({
            ...movementSummary(m, item),
            kind: "large_write_off" as const,
            typical: round1(weekly),
            reason:
              weekly > 0
                ? `Adjusted down ${lost} ${item.unit} — about ${round1(lost / weekly)} weeks of normal use`
                : `Adjusted down ${lost} ${item.unit} on an item with no recent usage`,
          });
        }
      }
    }
    anomalies.sort((a, b) => b.date.getTime() - a.date.getTime());

    forecasts.sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || b.next28 - a.next28);
    reorderPoints.sort(
      (a, b) =>
        (a.status === "too_low" ? 0 : 1) - (b.status === "too_low" ? 0 : 1) ||
        Math.abs(b.suggested - b.current) - Math.abs(a.suggested - a.current)
    );
    deadStock.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || b.idleDays - a.idleDays);

    res.json({
      generatedAt: now,
      historyDays: HISTORY_DAYS,
      forecastDays: FORECAST_DAYS,
      leadTime: scopeLeadTime,
      settings: {
        deadAfterDays: DEAD_AFTER_DAYS,
        slowCoverDays: SLOW_COVER_DAYS,
        anomalyWindowDays: ANOMALY_WINDOW_DAYS,
      },
      forecasts,
      reorderPoints,
      anomalies: anomalies.slice(0, MAX_ANOMALIES),
      deadStock,
      deadStockValue: Math.round(deadStock.reduce((sum, d) => sum + (d.value ?? 0), 0) * 100) / 100,
    });
  })
);

function summary(item: { id: string; name: string; unit: string; quantityOnHand: number; reorderPoint: number; hotel: { code: string } }) {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    hotelCode: item.hotel.code,
    onHand: item.quantityOnHand,
    reorderPoint: item.reorderPoint,
  };
}

function movementSummary(
  m: { id: string; type: string; quantity: number; notes: string | null; createdAt: Date; performedBy: { name: string } },
  item: { id: string; name: string; unit: string; hotel: { code: string } }
) {
  return {
    transactionId: m.id,
    date: m.createdAt,
    itemId: item.id,
    itemName: item.name,
    hotelCode: item.hotel.code,
    quantity: m.quantity,
    performedBy: m.performedBy.name,
    notes: m.notes,
  };
}
