import { NextFunction, Request, Response } from "express";
import { AuthTokenPayload, Role, verifyToken } from "../lib/auth";
import { prisma } from "../lib/prisma";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

// The only requests allowed while a password change is pending: loading the
// current user and changing the password.
const ALLOWED_DURING_PASSWORD_CHANGE = new Set(["GET /me", "POST /auth/change-password"]);

/**
 * Authenticates the request and loads the user's current role and scope from
 * the database — so disabling an account, resetting its password, or changing
 * its role takes effect on the very next request rather than when the token
 * expires.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  let claims;
  try {
    claims = verifyToken(header.slice("Bearer ".length));
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, role: true, hotelId: true, departmentId: true, disabledAt: true, tokenVersion: true, mustChangePassword: true },
    });
    if (!user || user.disabledAt || user.tokenVersion !== claims.tv) {
      return res.status(401).json({ error: "Your session has ended. Please sign in again." });
    }

    req.user = { userId: user.id, role: user.role, hotelId: user.hotelId, departmentId: user.departmentId };

    const route = `${req.method} ${req.originalUrl.split("?")[0]}`;
    if (user.mustChangePassword && !ALLOWED_DURING_PASSWORD_CHANGE.has(route)) {
      return res.status(403).json({ error: "You must change your password before continuing.", code: "PASSWORD_CHANGE_REQUIRED" });
    }
    next();
  } catch (err) {
    next(err);
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
