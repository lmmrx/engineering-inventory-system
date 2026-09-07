import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { authRouter } from "./routes/auth";
import { categoriesRouter } from "./routes/categories";
import { exportRouter } from "./routes/export";
import { hotelsRouter } from "./routes/hotels";
import { itemsRouter } from "./routes/items";
import { purchaseRequestsRouter } from "./routes/purchaseRequests";
import { transactionsRouter } from "./routes/transactions";
import { usersRouter } from "./routes/users";
import { workOrdersRouter } from "./routes/workOrders";
import { requireAuth } from "./middleware/auth";
import { asyncHandler } from "./lib/asyncHandler";
import { prisma } from "./lib/prisma";

export function createApp() {
  const app = express();

  // CLIENT_ORIGIN may list several allowed origins, comma-separated (a Vercel
  // project commonly has more than one valid domain — a production alias, an
  // auto-generated one, a custom domain). Falls back to local dev if unset.
  const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
    })
  );
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/auth", authRouter);
  app.use("/hotels", hotelsRouter);
  app.use("/users", usersRouter);
  app.use("/categories", categoriesRouter);
  app.use("/items", itemsRouter);
  app.use("/transactions", transactionsRouter);
  app.use("/work-orders", workOrdersRouter);
  app.use("/purchase-requests", purchaseRequestsRouter);
  app.use("/export", exportRouter);

  app.get(
    "/departments",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });
      res.json(departments);
    })
  );

  app.get(
    "/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { id: true, name: true, email: true, role: true, hotelId: true, departmentId: true },
      });
      res.json(user);
    })
  );

  const updateMeSchema = z.object({ name: z.string().min(1) });

  app.patch(
    "/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = updateMeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const user = await prisma.user.update({
        where: { id: req.user!.userId },
        data: { name: parsed.data.name },
        select: { id: true, name: true, email: true, role: true, hotelId: true, departmentId: true },
      });
      res.json(user);
    })
  );

  // Catches anything a route didn't handle itself (including async errors passed to
  // next() by asyncHandler) so a bad request returns a clean JSON error instead of
  // crashing the process or leaving the client hanging.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);

    const prismaError = err as { code?: string; meta?: { target?: string[] } };
    if (prismaError?.code === "P2002") {
      const fields = prismaError.meta?.target?.join(", ") ?? "this value";
      return res.status(409).json({ error: `A record with this ${fields} already exists` });
    }
    if (prismaError?.code === "P2025") {
      return res.status(404).json({ error: "Record not found" });
    }
    if (prismaError?.code === "P2003") {
      return res.status(400).json({ error: "Referenced record does not exist" });
    }

    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}
