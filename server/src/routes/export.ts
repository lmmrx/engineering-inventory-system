import { Request, Response, Router } from "express";
import { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { recordRef as ref } from "../lib/audit";
import { DAY_MS, StockStatus, dailyUsage, recentIssuedByItem, stockStatus } from "../lib/stock";
import { requireAuth, requireRole, resolveDepartmentScope, resolveHotelScope } from "../middleware/auth";
import { auditLogInclude, auditLogWhere } from "./auditLogs";

export const exportRouter = Router();

exportRouter.use(requireAuth, requireRole("ADMIN", "MANAGER"));

// A safety net for the row-per-event reports; a date range keeps real exports well under it.
const MAX_ROWS = 50_000;

const STATUS_LABEL: Record<StockStatus, string> = {
  out: "Out of stock",
  low: "Low",
  over: "Over max",
  healthy: "OK",
};

const TYPE_LABEL: Record<TransactionType, string> = {
  RECEIVE: "Receive",
  ISSUE: "Issue",
  ADJUSTMENT: "Adjustment",
};

function csvCell(value: unknown): string {
  let s = String(value ?? "");
  // A text cell starting with = + - @ is run as a formula by Excel/Sheets, so a
  // crafted item name or note could execute on the reader's machine. Numbers
  // (like negative quantities) are written as numbers and left alone.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sendCsv(res: Response, header: string[], rows: unknown[][]) {
  // The byte-order mark makes Excel read the file as UTF-8 instead of mangling
  // accented names; CRLF is what Excel expects between rows.
  const csv = "﻿" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment");
  res.send(csv);
}

function money(value: number | Prisma.Decimal | null | undefined): string {
  return value == null ? "" : Number(value).toFixed(2);
}

/**
 * Formats timestamps in the reader's time zone (sent by the browser as ?tz=),
 * so a 9pm issue in Manila isn't filed under the next day in a UTC export.
 */
function dateFormatter(req: Request) {
  const requested = typeof req.query.tz === "string" ? req.query.tz : "UTC";
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: requested,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return dateFormatter({ query: {} } as Request);
  }
  const parts = (d: Date) => Object.fromEntries(format.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    dateTime: (d: Date | null) => {
      if (!d) return "";
      const p = parts(d);
      return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
    },
    date: (d: Date | null) => {
      if (!d) return "";
      const p = parts(d);
      return `${p.year}-${p.month}-${p.day}`;
    },
  };
}

/**
 * The reporting period, as ISO instants. The browser converts its local
 * "Oct 1 – Oct 31" into exact start/end instants, so day boundaries follow the
 * reader's time zone. Defaults to the last 30 days.
 */
function parsePeriod(req: Request, res: Response): { from: Date; to: Date } | null {
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date();
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date(to.getTime() - 30 * DAY_MS);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    res.status(400).json({ error: "Invalid date range" });
    return null;
  }
  if (from > to) {
    res.status(400).json({ error: "The start date must be before the end date" });
    return null;
  }
  return { from, to };
}

function scope(req: Request) {
  const hotelId = resolveHotelScope(req);
  const departmentId = resolveDepartmentScope(req);
  return { hotelId, departmentId, itemScope: hotelId || departmentId ? { hotelId, departmentId } : undefined };
}

type CategoryWithParent = { name: string; parent: { name: string } | null };

/** Splits the two-level category into Group / Subcategory columns. */
function categoryColumns(category: CategoryWithParent): [string, string] {
  return category.parent ? [category.parent.name, category.name] : [category.name, ""];
}

const itemInclude = { hotel: true, category: { include: { parent: true } } } as const;

function byCategoryThenName(
  a: { hotel: { name: string }; category: CategoryWithParent; name: string },
  b: { hotel: { name: string }; category: CategoryWithParent; name: string }
) {
  const [ag, as] = categoryColumns(a.category);
  const [bg, bs] = categoryColumns(b.category);
  return (
    a.hotel.name.localeCompare(b.hotel.name) ||
    ag.localeCompare(bg) ||
    as.localeCompare(bs) ||
    a.name.localeCompare(b.name)
  );
}

/** Current stock snapshot with valuation. */
exportRouter.get(
  "/inventory",
  asyncHandler(async (req, res) => {
    const { hotelId, departmentId } = scope(req);
    const items = await prisma.inventoryItem.findMany({ where: { hotelId, departmentId }, include: itemInclude });
    items.sort(byCategoryThenName);

    sendCsv(
      res,
      [
        "Hotel", "Group", "Subcategory", "Item", "SKU", "Unit", "On Hand", "Reorder Point", "Max Level",
        "Status", "Unit Cost", "Total Value", "Location",
      ],
      items.map((i) => [
        i.hotel.name,
        ...categoryColumns(i.category),
        i.name,
        i.sku ?? "",
        i.unit,
        i.quantityOnHand,
        i.reorderPoint,
        i.maxLevel ?? "",
        STATUS_LABEL[stockStatus(i)],
        money(i.unitCost),
        i.unitCost == null ? "" : money(Number(i.unitCost) * i.quantityOnHand),
        i.location ?? "",
      ])
    );
  })
);

/** Items at or below their reorder point, with how much to order. */
exportRouter.get(
  "/reorder",
  asyncHandler(async (req, res) => {
    const { hotelId, departmentId, itemScope } = scope(req);
    const now = Date.now();
    const [items, issuedQty, openLines] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { hotelId, departmentId }, include: itemInclude }),
      recentIssuedByItem(itemScope, now),
      // Already requested but not yet received — counted so the list doesn't double-order.
      prisma.purchaseRequestItem.findMany({
        where: { purchaseRequest: { hotelId, departmentId, status: { in: ["PENDING", "APPROVED"] } } },
        select: { itemId: true, quantityRequested: true, quantityReceived: true },
      }),
    ]);

    const onOrder = new Map<string, number>();
    for (const line of openLines) {
      onOrder.set(line.itemId, (onOrder.get(line.itemId) ?? 0) + Math.max(0, line.quantityRequested - line.quantityReceived));
    }

    const rows = items
      .filter((i) => i.quantityOnHand <= i.reorderPoint)
      .map((i) => {
        const usage = dailyUsage(issuedQty.get(i.id) ?? 0, i.createdAt, now);
        const ordered = onOrder.get(i.id) ?? 0;
        // Refill to the max level; without one, to twice the reorder point.
        const target = i.maxLevel ?? i.reorderPoint * 2;
        const suggested = Math.max(0, target - i.quantityOnHand - ordered);
        return { item: i, usage, ordered, suggested, daysOfCover: usage > 0 ? Math.floor(i.quantityOnHand / usage) : null };
      })
      // Most urgent first; items with no recent usage sort after those running out.
      .sort(
        (a, b) =>
          (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity) || byCategoryThenName(a.item, b.item)
      );

    sendCsv(
      res,
      [
        "Hotel", "Group", "Subcategory", "Item", "SKU", "Unit", "On Hand", "Reorder Point", "Max Level", "Status",
        "Avg Daily Use (30d)", "Days of Cover", "On Open Purchase Requests", "Suggested Order Qty", "Unit Cost",
        "Est. Order Cost", "Location",
      ],
      rows.map(({ item: i, usage, ordered, suggested, daysOfCover }) => [
        i.hotel.name,
        ...categoryColumns(i.category),
        i.name,
        i.sku ?? "",
        i.unit,
        i.quantityOnHand,
        i.reorderPoint,
        i.maxLevel ?? "",
        STATUS_LABEL[stockStatus(i)],
        Math.round(usage * 10) / 10,
        daysOfCover ?? "",
        ordered,
        suggested,
        money(i.unitCost),
        i.unitCost == null ? "" : money(Number(i.unitCost) * suggested),
        i.location ?? "",
      ])
    );
  })
);

/**
 * Opening balance, movements and closing balance per item for the period.
 * Balances are worked backwards from today's on-hand quantity, which is exact
 * because stock only ever changes through transactions.
 */
exportRouter.get(
  "/movement",
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req, res);
    if (!period) return;
    const { hotelId, departmentId, itemScope } = scope(req);

    const [items, inPeriod, afterPeriod] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { hotelId, departmentId, createdAt: { lte: period.to } },
        include: itemInclude,
      }),
      prisma.stockTransaction.groupBy({
        by: ["itemId", "type"],
        where: { item: itemScope, createdAt: { gte: period.from, lte: period.to } },
        _sum: { quantity: true },
      }),
      prisma.stockTransaction.groupBy({
        by: ["itemId"],
        where: { item: itemScope, createdAt: { gt: period.to } },
        _sum: { quantity: true },
      }),
    ]);
    items.sort(byCategoryThenName);

    const moved = new Map<string, Record<TransactionType, number>>();
    for (const row of inPeriod) {
      const sums = moved.get(row.itemId) ?? { RECEIVE: 0, ISSUE: 0, ADJUSTMENT: 0 };
      sums[row.type] = row._sum.quantity ?? 0;
      moved.set(row.itemId, sums);
    }
    const changedSince = new Map(afterPeriod.map((row) => [row.itemId, row._sum.quantity ?? 0]));
    const periodDays = Math.max(1, Math.ceil((period.to.getTime() - period.from.getTime()) / DAY_MS));

    sendCsv(
      res,
      [
        "Hotel", "Group", "Subcategory", "Item", "SKU", "Unit", "Opening", "Received", "Issued", "Adjusted",
        "Closing", "Avg Daily Use", "Unit Cost", "Value Issued",
      ],
      items.map((i) => {
        const sums = moved.get(i.id) ?? { RECEIVE: 0, ISSUE: 0, ADJUSTMENT: 0 };
        const issued = -sums.ISSUE;
        const closing = i.quantityOnHand - (changedSince.get(i.id) ?? 0);
        const opening = closing - sums.RECEIVE - sums.ISSUE - sums.ADJUSTMENT;
        return [
          i.hotel.name,
          ...categoryColumns(i.category),
          i.name,
          i.sku ?? "",
          i.unit,
          opening,
          sums.RECEIVE,
          issued,
          sums.ADJUSTMENT,
          closing,
          Math.round((issued / periodDays) * 10) / 10,
          money(i.unitCost),
          i.unitCost == null ? "" : money(Number(i.unitCost) * issued),
        ];
      })
    );
  })
);

/** Every receive, issue and adjustment in the period. */
exportRouter.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req, res);
    if (!period) return;
    const { itemScope } = scope(req);
    const fmt = dateFormatter(req);
    const type = req.query.type;

    const transactions = await prisma.stockTransaction.findMany({
      where: {
        item: itemScope,
        createdAt: { gte: period.from, lte: period.to },
        type: typeof type === "string" && type in TYPE_LABEL ? (type as TransactionType) : undefined,
      },
      include: { item: { include: itemInclude }, performedBy: true, workOrder: true },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });

    sendCsv(
      res,
      [
        "Date", "Hotel", "Group", "Subcategory", "Item", "SKU", "Type", "Quantity", "Unit", "Unit Cost", "Value",
        "Performed By", "Work Order", "Work Order Title", "Purchase Request", "Notes",
      ],
      transactions.map((t) => [
        fmt.dateTime(t.createdAt),
        t.item.hotel.name,
        ...categoryColumns(t.item.category),
        t.item.name,
        t.item.sku ?? "",
        TYPE_LABEL[t.type],
        t.quantity,
        t.item.unit,
        money(t.item.unitCost),
        t.item.unitCost == null ? "" : money(Number(t.item.unitCost) * t.quantity),
        t.performedBy.name,
        ref("WO", t.workOrderId),
        t.workOrder?.title ?? "",
        ref("PR", t.purchaseRequestId),
        t.notes ?? "",
      ])
    );
  })
);

/** Work orders created in the period, with the materials they consumed. */
exportRouter.get(
  "/work-orders",
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req, res);
    if (!period) return;
    const { hotelId, departmentId } = scope(req);
    const fmt = dateFormatter(req);
    const now = Date.now();

    const workOrders = await prisma.workOrder.findMany({
      where: { hotelId, departmentId, createdAt: { gte: period.from, lte: period.to } },
      include: {
        hotel: true,
        createdBy: true,
        assignedTo: true,
        transactions: { where: { type: "ISSUE" }, select: { quantity: true, item: { select: { unitCost: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });

    sendCsv(
      res,
      [
        "Work Order", "Created", "Hotel", "Title", "Status", "Created By", "Assigned To", "Completed",
        "Days Open", "Items Issued", "Materials Cost", "Description",
      ],
      workOrders.map((wo) => {
        const end = wo.completedAt?.getTime() ?? now;
        const anyUncosted = wo.transactions.some((t) => t.item.unitCost == null);
        const materialsCost = wo.transactions.reduce((sum, t) => sum + -t.quantity * Number(t.item.unitCost ?? 0), 0);
        return [
          ref("WO", wo.id),
          fmt.dateTime(wo.createdAt),
          wo.hotel.name,
          wo.title,
          wo.status === "IN_PROGRESS" ? "In progress" : wo.status === "OPEN" ? "Open" : "Completed",
          wo.createdBy.name,
          wo.assignedTo?.name ?? "",
          fmt.dateTime(wo.completedAt),
          Math.round(((end - wo.createdAt.getTime()) / DAY_MS) * 10) / 10,
          wo.transactions.reduce((sum, t) => sum - t.quantity, 0),
          // A partial total would understate the cost, so leave it blank instead.
          wo.transactions.length === 0 ? "" : anyUncosted ? "" : money(materialsCost),
          wo.description ?? "",
        ];
      })
    );
  })
);

/** Purchase requests created in the period, one row per requested item. */
exportRouter.get(
  "/purchase-requests",
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req, res);
    if (!period) return;
    const { hotelId, departmentId } = scope(req);
    const fmt = dateFormatter(req);

    const requests = await prisma.purchaseRequest.findMany({
      where: { hotelId, departmentId, createdAt: { gte: period.from, lte: period.to } },
      include: { hotel: true, requestedBy: true, approvedBy: true, items: { include: { item: true } } },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });

    const statusLabel = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", RECEIVED: "Received" };

    sendCsv(
      res,
      [
        "Purchase Request", "Date", "Hotel", "Status", "Requested By", "Approved/Rejected By", "Decided At",
        "Received At", "Item", "SKU", "Unit",
        "Qty Requested", "Qty Received", "Qty Outstanding", "Estimated Cost", "Notes",
      ],
      requests.flatMap((pr) =>
        pr.items.map((line) => [
          ref("PR", pr.id),
          fmt.dateTime(pr.createdAt),
          pr.hotel.name,
          statusLabel[pr.status],
          pr.requestedBy.name,
          pr.approvedBy?.name ?? "",
          fmt.dateTime(pr.decidedAt),
          fmt.dateTime(pr.receivedAt),
          line.item.name,
          line.item.sku ?? "",
          line.item.unit,
          line.quantityRequested,
          line.quantityReceived,
          pr.status === "REJECTED" ? 0 : Math.max(0, line.quantityRequested - line.quantityReceived),
          money(line.estimatedCost),
          pr.notes ?? "",
        ])
      )
    );
  })
);

function formatChangeValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "(empty)";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** The audit log for the period, with the same filters as the Audit log page. */
exportRouter.get(
  "/audit-log",
  asyncHandler(async (req, res) => {
    const period = parsePeriod(req, res);
    if (!period) return;
    const fmt = dateFormatter(req);

    const entries = await prisma.auditLog.findMany({
      where: auditLogWhere(req, period),
      include: auditLogInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_ROWS,
    });

    sendCsv(
      res,
      ["Date", "User", "User Email", "Action", "Record Type", "Record ID", "Summary", "Changes", "IP Address"],
      entries.map((e) => [
        fmt.dateTime(e.createdAt),
        e.actor?.name ?? "",
        e.actor?.email ?? "",
        e.action,
        e.entityType,
        e.entityId ?? "",
        e.summary,
        Object.entries((e.changes ?? {}) as Record<string, { from: unknown; to: unknown }>)
          .map(([field, c]) => `${field}: ${formatChangeValue(c.from)} -> ${formatChangeValue(c.to)}`)
          .join("; "),
        e.ip ?? "",
      ])
    );
  })
);
