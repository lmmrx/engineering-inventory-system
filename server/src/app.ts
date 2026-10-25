import cors from "cors";
import helmet from "helmet";
import express, { NextFunction, Request, Response } from "express";
import { analyticsRouter } from "./routes/analytics";
import { auditLogsRouter } from "./routes/auditLogs";
import { authRouter } from "./routes/auth";
import { avatarsRouter, meRouter } from "./routes/me";
import { categoriesRouter } from "./routes/categories";
import { dashboardRouter } from "./routes/dashboard";
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
  // Render terminates TLS in one proxy hop; trusting it makes req.ip the
  // caller's address (recorded in the audit log) instead of the proxy's.
  app.set("trust proxy", 1);

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
  // Standard security headers (nosniff, no framing, HSTS, a deny-all CSP —
  // the API only ever serves JSON).
  app.use(helmet());
  // Photo uploads arrive as base64 text; the browser has already shrunk them,
  // so this route alone gets a little more room than every other request.
  app.use("/me/avatar", express.json({ limit: "400kb" }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Also touches the database, so the client's warm-up ping wakes a cold
  // free-tier DB connection as well as the API process itself.
  app.get(
    "/health/db",
    asyncHandler(async (_req, res) => {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    })
  );

  app.use("/auth", authRouter);
  app.use("/hotels", hotelsRouter);
  app.use("/users", usersRouter);
  app.use("/categories", categoriesRouter);
  app.use("/items", itemsRouter);
  app.use("/transactions", transactionsRouter);
  app.use("/work-orders", workOrdersRouter);
  app.use("/purchase-requests", purchaseRequestsRouter);
  app.use("/export", exportRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/audit-logs", auditLogsRouter);
  app.use("/analytics", analyticsRouter);
  app.use("/me", meRouter);
  app.use("/avatars", avatarsRouter);

  app.get(
    "/departments",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });
      res.json(departments);
    })
  );

  // Catches anything a route didn't handle itself (including async errors passed to
  // next() by asyncHandler) so a bad request returns a clean JSON error instead of
  // crashing the process or leaving the client hanging.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);

    if ((err as { type?: string })?.type === "entity.too.large") {
      return res.status(413).json({ error: "That upload is too large — try a smaller photo" });
    }

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
