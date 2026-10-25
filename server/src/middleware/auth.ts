import { NextFunction, Request, Response } from "express";
import { AuthTokenPayload, Role, verifyToken } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { isPasswordExpired } from "../lib/password";
import { Permission, effectivePermissions } from "../lib/permissions";

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
      select: {
        id: true,
        role: true,
        hotelId: true,
        departmentId: true,
        disabledAt: true,
        tokenVersion: true,
        mustChangePassword: true,
        passwordChangedAt: true,
        extraPermissions: true,
      },
    });
    if (!user || user.disabledAt || user.tokenVersion !== claims.tv) {
      return res.status(401).json({ error: "Your session has ended. Please sign in again." });
    }

    // A password that expires mid-session is caught on the next request, not just at sign-in.
    if (!user.mustChangePassword && isPasswordExpired(user.passwordChangedAt)) {
      await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
      user.mustChangePassword = true;
    }

    req.user = {
      userId: user.id,
      role: user.role,
      hotelId: user.hotelId,
      departmentId: user.departmentId,
      permissions: effectivePermissions(user.role, user.extraPermissions),
    };

    const route = `${req.method} ${req.originalUrl.split("?")[0]}`;
    if (user.mustChangePassword && !ALLOWED_DURING_PASSWORD_CHANGE.has(route)) {
      return res.status(403).json({ error: "You must change your password before continuing.", code: "PASSWORD_CHANGE_REQUIRED" });
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Matches no real record. A Manager/Staff account missing its hotel or
 * department is scoped to this, so it sees nothing rather than everything.
 */
export const NO_SCOPE = "__none__";

/** Lets the request through only if the user has the feature, from their role or granted to them. */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
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
  return req.user!.hotelId ?? NO_SCOPE;
}

/**
 * Whether a record lies outside what this request may touch: outside the
 * user's own hotel and department, or (for an Admin) outside the hotel or
 * department they picked with ?hotelId= / ?departmentId=.
 */
export function outOfScope(req: Request, record: { hotelId: string | null; departmentId: string | null }) {
  const hotelId = resolveHotelScope(req);
  const departmentId = resolveDepartmentScope(req);
  return (!!hotelId && record.hotelId !== hotelId) || (!!departmentId && record.departmentId !== departmentId);
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
  return req.user!.departmentId ?? NO_SCOPE;
}
