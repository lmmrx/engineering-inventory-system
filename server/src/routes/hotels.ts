import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { audit, created, diff } from "../lib/audit";
import { requireAuth, requireRole } from "../middleware/auth";

export const hotelsRouter = Router();

hotelsRouter.use(requireAuth);

hotelsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    if (req.user!.role === "ADMIN") {
      const hotels = await prisma.hotel.findMany({ orderBy: { name: "asc" } });
      return res.json(hotels);
    }
    // Manager/Staff only ever need their own hotel — never the full portfolio.
    const hotels = await prisma.hotel.findMany({
      where: { id: req.user!.hotelId ?? undefined },
      orderBy: { name: "asc" },
    });
    res.json(hotels);
  })
);

const upsertSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().optional(),
});

hotelsRouter.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.hotel.findUnique({ where: { code: parsed.data.code } });
    if (existing) return res.status(409).json({ error: "A hotel with this code already exists" });

    const hotel = await prisma.hotel.create({ data: parsed.data });
    await audit(req, {
      action: "hotel.created",
      entityId: hotel.id,
      summary: `Created hotel ${hotel.name} (${hotel.code})`,
      changes: await created(hotel, ["name", "code", "address"]),
      hotelId: hotel.id,
    });
    res.status(201).json(hotel);
  })
);

hotelsRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = upsertSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.hotel.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Hotel not found" });

    if (parsed.data.code) {
      const duplicate = await prisma.hotel.findUnique({ where: { code: parsed.data.code } });
      if (duplicate && duplicate.id !== existing.id) {
        return res.status(409).json({ error: "A hotel with this code already exists" });
      }
    }

    const hotel = await prisma.hotel.update({ where: { id: req.params.id }, data: parsed.data });
    const changes = await diff(existing, hotel, ["name", "code", "address"]);
    if (Object.keys(changes).length > 0) {
      await audit(req, {
        action: "hotel.updated",
        entityId: hotel.id,
        summary: `Updated hotel ${hotel.name}`,
        changes,
        hotelId: hotel.id,
      });
    }
    res.json(hotel);
  })
);
