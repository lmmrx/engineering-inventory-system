import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Department } from "../types";
import { useAuth } from "./AuthContext";

interface DepartmentScopeValue {
  departments: Department[];
  selectedDepartmentId: string;
  setSelectedDepartmentId: (id: string) => void;
  canSwitchDepartments: boolean;
}

const DepartmentScopeContext = createContext<DepartmentScopeValue | undefined>(undefined);

export function DepartmentScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Unlike hotels, there's no "All Departments" mode — a Housekeeping linen
  // count and an Engineering HVAC filter count aren't meaningful mixed
  // together, so every view always has exactly one department selected.
  const canSwitchDepartments = user?.role === "ADMIN";
  // Shared with every other page that lists departments, so it's fetched once.
  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/departments"),
    enabled: !!user,
  });
  const [chosen, setChosen] = useState("");

  // Admins start on their own department if they have one, else the first.
  useEffect(() => {
    if (canSwitchDepartments && !chosen && departments.length > 0) setChosen(user?.departmentId ?? departments[0].id);
  }, [canSwitchDepartments, chosen, departments, user?.departmentId]);

  const selectedDepartmentId = canSwitchDepartments ? chosen : user?.departmentId ?? "";

  return (
    <DepartmentScopeContext.Provider
      value={{ departments, selectedDepartmentId, setSelectedDepartmentId: setChosen, canSwitchDepartments }}
    >
      {children}
    </DepartmentScopeContext.Provider>
  );
}

export function useDepartmentScope() {
  const ctx = useContext(DepartmentScopeContext);
  if (!ctx) throw new Error("useDepartmentScope must be used within DepartmentScopeProvider");
  return ctx;
}
