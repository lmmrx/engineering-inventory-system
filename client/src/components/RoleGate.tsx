import { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { Role } from "../types";

export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return null;
  return <>{children}</>;
}
