import { NextFunction, Request, Response } from "express";
import { AuthTokenPayload, Role, verifyToken } from "../lib/auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  try {
    req.user = verifyToken(header.slice("Bearer ".length));
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

/**
 * Resolves the hotelId a Manager/Staff request is scoped to. Admins may pass
 * ?hotelId= to view a specific hotel (or omit it to mean "all hotels").
 * Manager/Staff are always pinned to their own hotel, ignoring any query param.
 */
export function resolveHotelScope(req: Request): string | undefined {
  if (req.user!.role === "ADMIN") {
    const q = req.query.hotelId;
    return typeof q === "string" ? q : undefined;
  }
  return req.user!.hotelId ?? undefined;
}

/**
 * Resolves the departmentId a Manager/Staff request is scoped to. Admins may
 * pass ?departmentId= to view a specific department (or omit it to mean "no
 * filter"). Manager/Staff are always pinned to their own department.
 */
export function resolveDepartmentScope(req: Request): string | undefined {
  if (req.user!.role === "ADMIN") {
    const q = req.query.departmentId;
    return typeof q === "string" ? q : undefined;
  }
  return req.user!.departmentId ?? undefined;
}
