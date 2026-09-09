import { createContext, ReactNode, useContext, useEffect, useState } from "react";
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
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");

  // Unlike hotels, there's no "All Departments" mode — a Housekeeping linen
  // count and an Engineering HVAC filter count aren't meaningful mixed
  // together, so every view always has exactly one department selected.
  const canSwitchDepartments = user?.role === "ADMIN";

  useEffect(() => {
    if (!user) return;
    api.get<Department[]>("/departments").then((data) => {
      setDepartments(data);
      if (!canSwitchDepartments && user.departmentId) {
        setSelectedDepartmentId(user.departmentId);
      } else if (canSwitchDepartments && data.length > 0 && !selectedDepartmentId) {
        setSelectedDepartmentId(user.departmentId ?? data[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <DepartmentScopeContext.Provider
      value={{ departments, selectedDepartmentId, setSelectedDepartmentId, canSwitchDepartments }}
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
