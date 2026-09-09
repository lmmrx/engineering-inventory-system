import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useDepartmentScope } from "../../context/DepartmentScopeContext";
import { Category } from "../../types";

export function OrgCategories() {
  const { departments, selectedDepartmentId } = useDepartmentScope();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const departmentName = departments.find((d) => d.id === selectedDepartmentId)?.name ?? "";

  const categoriesQuery = useQuery({
    queryKey: ["categories", selectedDepartmentId],
    queryFn: () => api.get<Category[]>(`/categories?departmentId=${selectedDepartmentId}`),
    enabled: !!selectedDepartmentId,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/categories", { name, departmentId: selectedDepartmentId }),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["categories", selectedDepartmentId] });
    },
  });

  const errorMessage = createMutation.error instanceof Error ? createMutation.error.message : null;

  return (
    <div>
      <h2 className="font-semibold text-ink-100 mb-1">Categories</h2>
      <p className="text-sm text-ink-500 mb-4">
        Organize inventory items into categories within <span className="text-ink-300">{departmentName}</span>.
        Switch departments from the account menu to manage a different one.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) createMutation.mutate();
        }}
        className="flex gap-2 mb-4"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          className="input-field flex-1 max-w-xs"
        />
        <button type="submit" className="btn-primary">
          Add
        </button>
      </form>
      {errorMessage && <p className="text-sm text-rose-400 mb-4">{errorMessage}</p>}
      <ul className="card divide-y divide-navy-800">
        {categoriesQuery.data?.map((c) => (
          <li key={c.id} className="px-4 py-2 text-sm text-ink-200">
            {c.name}
          </li>
        ))}
        {categoriesQuery.data?.length === 0 && (
          <li className="px-4 py-2 text-sm text-ink-500">No categories yet in this department.</li>
        )}
      </ul>
    </div>
  );
}
