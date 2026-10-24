import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { audit, created, diff, recordRef } from "../lib/audit";
import { requireAuth, resolveDepartmentScope, resolveHotelScope } from "../middleware/auth";

export const workOrdersRouter = Router();

workOrdersRouter.use(requireAuth);

workOrdersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const hotelId = resolveHotelScope(req);
    const departmentId = resolveDepartmentScope(req);
    const workOrders = await prisma.workOrder.findMany({
      where: { hotelId, departmentId },
      include: {
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        hotel: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(workOrders);
  })
);

/** The assignee must be an active user who works in the work order's hotel and department, or an Admin. */
async function invalidAssignee(userId: string | null | undefined, hotelId: string, departmentId: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.disabledAt) return true;
  return user.role !== "ADMIN" && (user.hotelId !== hotelId || user.departmentId !== departmentId);
}

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  hotelId: z.string().min(1),
  departmentId: z.string().min(1),
  assignedToUserId: z.string().optional(),
});

workOrdersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const hotelId = resolveHotelScope(req);
    if (hotelId && parsed.data.hotelId !== hotelId) return res.status(403).json({ error: "Forbidden" });

    const departmentId = resolveDepartmentScope(req);
    if (departmentId && parsed.data.departmentId !== departmentId) return res.status(403).json({ error: "Forbidden" });

    if (await invalidAssignee(parsed.data.assignedToUserId, parsed.data.hotelId, parsed.data.departmentId)) {
      return res.status(400).json({ error: "The assignee must be an active user in this hotel and department" });
    }

    const workOrder = await prisma.workOrder.create({
      data: { ...parsed.data, createdByUserId: req.user!.userId },
    });
    await audit(req, {
      action: "work_order.created",
      entityId: workOrder.id,
      summary: `Opened work order ${recordRef("WO", workOrder.id)} "${workOrder.title}"`,
      changes: await created(workOrder, ["title", "description", "assignedToUserId"]),
      hotelId: workOrder.hotelId,
      departmentId: workOrder.departmentId,
    });
    res.status(201).json(workOrder);
  })
);

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]).optional(),
  assignedToUserId: z.string().nullable().optional(),
});

workOrdersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.workOrder.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Work order not found" });

    const hotelId = resolveHotelScope(req);
    if (hotelId && existing.hotelId !== hotelId) return res.status(403).json({ error: "Forbidden" });

    const departmentId = resolveDepartmentScope(req);
    if (departmentId && existing.departmentId !== departmentId) return res.status(403).json({ error: "Forbidden" });

    // Staff can take an unassigned job for themselves, but handing work to
    // someone else (or taking a colleague's) is for Managers and Admins.
    if (req.user!.role === "STAFF" && parsed.data.assignedToUserId !== undefined) {
      const self = req.user!.userId;
      const takingFree = parsed.data.assignedToUserId === self && existing.assignedToUserId === null;
      const unchanged = parsed.data.assignedToUserId === existing.assignedToUserId;
      if (!takingFree && !unchanged) {
        return res.status(403).json({
          error:
            existing.assignedToUserId && existing.assignedToUserId !== self
              ? "Someone else has already taken this work order"
              : "Staff can only assign unassigned work orders to themselves",
        });
      }
    }

    if (await invalidAssignee(parsed.data.assignedToUserId, existing.hotelId, existing.departmentId)) {
      return res.status(400).json({ error: "The assignee must be an active user in this hotel and department" });
    }

    const data = { ...parsed.data } as Record<string, unknown>;
    // Stamp completion once; reopening clears it so "days open" stays right.
    if (parsed.data.status === "COMPLETED" && existing.status !== "COMPLETED") data.completedAt = new Date();
    else if (parsed.data.status && parsed.data.status !== "COMPLETED") data.completedAt = null;

    const workOrder = await prisma.workOrder.update({ where: { id: req.params.id }, data });
    const changes = await diff(existing, workOrder, ["title", "description", "status", "assignedToUserId"]);
    if (Object.keys(changes).length > 0) {
      const label = `${recordRef("WO", workOrder.id)} "${workOrder.title}"`;
      await audit(req, {
        action: "work_order.updated",
        entityId: workOrder.id,
        summary: changes.status
          ? `Moved work order ${label} from ${existing.status} to ${workOrder.status}`
          : changes.assignedToUserId
          ? `Reassigned work order ${label}`
          : `Updated work order ${label}`,
        changes,
        hotelId: workOrder.hotelId,
        departmentId: workOrder.departmentId,
      });
    }
    res.json(workOrder);
  })
);
