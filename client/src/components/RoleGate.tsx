import { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { Permission, Role, can } from "../types";

/**
 * Shows its children only to users with one of the roles, or with the
 * permission (from their role or granted to them). The server checks the
 * same thing; this just keeps people from seeing buttons they can't use.
 */
export function RoleGate({
  roles,
  permission,
  children,
}: {
  roles?: Role[];
  permission?: Permission;
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!user) return null;
  if (roles && !roles.includes(user.role)) return null;
  if (permission && !can(user, permission)) return null;
  return <>{children}</>;
}
