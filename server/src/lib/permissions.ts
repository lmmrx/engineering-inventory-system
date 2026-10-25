import type { Role } from "./auth";

/**
 * What a user can do. Each role comes with a set of features; Admins, Managers
 * and Supervisors can also grant individual extras to people below them
 * (e.g. a Staff member who may approve purchase requests) without changing
 * their role. Where a feature applies — which hotel and department — is still
 * decided by the user's own scope, never by the permission.
 */
export const PERMISSIONS = [
  "approve_requests", // approve or reject purchase requests
  "edit_items", // add and edit inventory items
  "view_analytics", // the Analytics page
  "reports", // Reports & exports
  "manage_categories", // add, rename, move and delete categories
  "audit_log", // view and export the audit log
  "manage_staff", // create and edit accounts ranked below their own
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Features that can be granted to an individual. Managing accounts isn't one:
 * it stays tied to the role, so who can create or change accounts is always
 * clear from the role alone.
 */
export const GRANTABLE: Permission[] = [
  "approve_requests",
  "edit_items",
  "view_analytics",
  "reports",
  "manage_categories",
  "audit_log",
];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MANAGER: PERMISSIONS,
  SUPERVISOR: ["approve_requests", "edit_items", "view_analytics", "reports", "manage_staff"],
  STAFF: [],
};

/** Higher manages lower: a Manager manages Supervisors and Staff; a Supervisor manages Staff. */
export const ROLE_RANK: Record<Role, number> = { STAFF: 1, SUPERVISOR: 2, MANAGER: 3, ADMIN: 4 };

export function roleDefaults(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** The role's features plus any valid extras granted to this user. */
export function effectivePermissions(role: Role, extras: readonly string[]): Permission[] {
  const all = new Set<Permission>(ROLE_PERMISSIONS[role]);
  for (const extra of extras) {
    if ((GRANTABLE as string[]).includes(extra)) all.add(extra as Permission);
  }
  return PERMISSIONS.filter((p) => all.has(p));
}
