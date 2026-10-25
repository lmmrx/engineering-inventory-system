import { prisma } from "./prisma";
import { passwordExpiresAt } from "./password";
import { readPreferences } from "./preferences";
import { effectivePermissions } from "./permissions";

const include = {
  manager: { select: { id: true, name: true } },
  avatar: { select: { updatedAt: true } },
} as const;

/**
 * The signed-in user as the app sees it: from sign-in, password changes and
 * GET /me. Never includes the password hash or the photo bytes themselves.
 */
export async function loadPublicUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, include });
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    // What the app should show: the role's features plus any granted extras.
    permissions: effectivePermissions(user.role, user.extraPermissions),
    hotelId: user.hotelId,
    departmentId: user.departmentId,
    mustChangePassword: user.mustChangePassword,
    // Lets the app remind the user before their password expires.
    passwordExpiresAt: passwordExpiresAt(user.passwordChangedAt),
    preferences: readPreferences(user.preferences),
    position: user.position,
    phone: user.phone,
    manager: user.manager,
    // Changes whenever the photo does, so the browser fetches the new one.
    avatarVersion: user.avatar ? user.avatar.updatedAt.getTime() : null,
  };
}
