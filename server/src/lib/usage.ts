import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { DAY_MS } from "./stock";
import { ForecastResult, FORECAST_DAYS, daysUntilEmpty, forecastUsage } from "./forecast";

/**
 * Daily usage history and the forecast built on it — the single source for
 * "how fast is this used, and when does it run out" on the Dashboard, the
 * Stock report and the Analytics page, so they always agree.
 */

// How much history the forecast learns from (26 weeks).
export const HISTORY_DAYS = 182;

/**
 * Turns timestamps into whole days in the reader's time zone (sent as ?tz=),
 * so "busy Saturdays" means Saturdays where the hotel is, not in UTC.
 * Returns days since 1970-01-01 in local time; see weekdayOf.
 */
export function localDayCounter(tz: unknown) {
  const options = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: typeof tz === "string" ? tz : "UTC" });
  } catch {
    format = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "UTC" });
  }
  return (d: Date) => {
    const [y, m, day] = format.format(d).split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, day) / DAY_MS);
  };
}

/** Weekday of a day number from localDayCounter, Sunday = 0. */
export const weekdayOf = (dayNumber: number) => (((dayNumber + 4) % 7) + 7) % 7;

export function groupByItem<T extends { itemId: string }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.itemId) ?? [];
    list.push(row);
    groups.set(row.itemId, list);
  }
  return groups;
}

export interface UsageHistory {
  /** Units issued per day, oldest first, ending yesterday (today is still in progress). */
  usage: number[];
  /** Weekday of each day in `usage`. */
  weekdays: number[];
}

/** An item's daily usage over the history window, starting no earlier than the day it was added. */
export function usageHistory(
  item: { createdAt: Date },
  issues: { createdAt: Date; quantity: number }[],
  dayOf: (d: Date) => number,
  today: number
): UsageHistory {
  // Starting at the item's creation means a new item isn't read as idle before it existed.
  const firstDay = Math.max(today - HISTORY_DAYS, dayOf(item.createdAt));
  const length = Math.max(0, today - firstDay);
  const usage: number[] = Array(length).fill(0);
  const weekdays = usage.map((_, i) => weekdayOf(firstDay + i));
  for (const issue of issues) {
    const index = dayOf(issue.createdAt) - firstDay;
    // ISSUE quantities are stored as negative deltas.
    if (index >= 0 && index < length) usage[index] += -issue.quantity;
  }
  return { usage, weekdays };
}

export interface Outlook extends ForecastResult {
  /** Forecast average use per day over the next FORECAST_DAYS days. */
  dailyRate: number;
  /** Days until stock runs out at the forecast rate; null = over a year. */
  daysLeft: number | null;
}

/** The forecast for one item, or null if it hasn't been used in the history window. */
export function outlook(history: UsageHistory, onHand: number, today: number): Outlook | null {
  if (!history.usage.some((v) => v > 0)) return null;
  const result = forecastUsage(history.usage, history.weekdays, weekdayOf(today));
  return {
    ...result,
    dailyRate: result.daily.reduce((a, b) => a + b, 0) / FORECAST_DAYS,
    daysLeft: daysUntilEmpty(onHand, result.daily),
  };
}

/** Loads usage history and forecasts every given item; items with no recent usage are left out. */
export async function loadOutlooks(
  itemScope: Prisma.InventoryItemWhereInput | undefined,
  items: { id: string; createdAt: Date; quantityOnHand: number }[],
  tz: unknown,
  now = new Date()
) {
  const issues = await prisma.stockTransaction.findMany({
    where: { item: itemScope, type: "ISSUE", createdAt: { gte: new Date(now.getTime() - (HISTORY_DAYS + 1) * DAY_MS) } },
    select: { itemId: true, quantity: true, createdAt: true },
  });
  const issuesByItem = groupByItem(issues);
  const dayOf = localDayCounter(tz);
  const today = dayOf(now);

  const outlooks = new Map<string, Outlook>();
  for (const item of items) {
    const result = outlook(usageHistory(item, issuesByItem.get(item.id) ?? [], dayOf, today), item.quantityOnHand, today);
    if (result) outlooks.set(item.id, result);
  }
  return outlooks;
}
