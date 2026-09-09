import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, requireRole, resolveDepartmentScope, resolveHotelScope } from "../middleware/auth";

export const exportRouter = Router();

exportRouter.use(requireAuth, requireRole("ADMIN", "MANAGER"));

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

exportRouter.get(
  "/inventory",
  asyncHandler(async (req, res) => {
    const hotelId = resolveHotelScope(req);
    const departmentId = resolveDepartmentScope(req);
    const items = await prisma.inventoryItem.findMany({
      where: { hotelId, departmentId },
      include: { hotel: true, category: true },
      orderBy: [{ hotel: { name: "asc" } }, { name: "asc" }],
    });

    const csv = toCsv(
      ["Hotel", "Category", "Name", "SKU", "Unit", "Quantity On Hand", "Reorder Point", "Location"],
      items.map((i) => [
        i.hotel.name,
        i.category.name,
        i.name,
        i.sku ?? "",
        i.unit,
        i.quantityOnHand,
        i.reorderPoint,
        i.location ?? "",
      ])
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory-export.csv"');
    res.send(csv);
  })
);

exportRouter.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const hotelId = resolveHotelScope(req);
    const departmentId = resolveDepartmentScope(req);
    const transactions = await prisma.stockTransaction.findMany({
      where: { item: hotelId || departmentId ? { hotelId, departmentId } : undefined },
      include: { item: { include: { hotel: true } }, performedBy: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const csv = toCsv(
      ["Date", "Hotel", "Item", "Type", "Quantity", "Performed By", "Notes"],
      transactions.map((t) => [
        t.createdAt.toISOString(),
        t.item.hotel.name,
        t.item.name,
        t.type,
        t.quantity,
        t.performedBy.name,
        t.notes ?? "",
      ])
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="transactions-export.csv"');
    res.send(csv);
  })
);
