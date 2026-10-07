import { Request, Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";

export const auditLogsRouter = Router();

auditLogsRouter.use(requireAuth, requireRole("ADMIN", "MANAGER"));

const PAGE_SIZE = 50;

/**
 * The filters shared by the audit log page and its CSV export. A Manager only
 * sees entries for their own hotel + department, plus department-wide entries
 * (like categories) that have no hotel. Admins see everything, including
 * organization-level events such as new hotels or sign-ins by other admins.
 */
export function auditLogWhere(req: Request, period?: { from: Date; to: Date }): Prisma.AuditLogWhereInput {
  const { entityType, actorUserId, q } = req.query;
  const conditions: Prisma.AuditLogWhereInput[] = [];

  if (req.user!.role === "MANAGER") {
    conditions.push({
      departmentId: req.user!.departmentId ?? "__none__",
      OR: [{ hotelId: req.user!.hotelId ?? "__none__" }, { hotelId: null }],
    });
  }
  if (period) conditions.push({ createdAt: { gte: period.from, lte: period.to } });
  if (typeof entityType === "string" && entityType) conditions.push({ entityType });
  if (typeof actorUserId === "string" && actorUserId) conditions.push({ actorUserId });
  if (typeof q === "string" && q.trim()) conditions.push({ summary: { contains: q.trim(), mode: "insensitive" } });

  return { AND: conditions };
}

export const auditLogInclude = { actor: { select: { id: true, name: true, email: true } } } as const;

auditLogsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
      return res.status(400).json({ error: "Invalid date range" });
    }
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

    const entries = await prisma.auditLog.findMany({
      where: auditLogWhere(req, from && to ? { from, to } : undefined),
      include: auditLogInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = entries.length > PAGE_SIZE;
    const page = hasMore ? entries.slice(0, PAGE_SIZE) : entries;
    res.json({ entries: page, nextCursor: hasMore ? page[page.length - 1].id : null });
  })
);
