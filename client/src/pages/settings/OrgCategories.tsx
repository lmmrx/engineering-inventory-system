import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Category } from "../../types";

export function OrgCategories() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const categoriesQuery = useQuery({
    queryKey: ["categories", user?.departmentId],
    queryFn: () => api.get<Category[]>(`/categories?departmentId=${user?.departmentId}`),
    enabled: !!user?.departmentId,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/categories", { name, departmentId: user!.departmentId }),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["categories", user?.departmentId] });
    },
  });

  const errorMessage = createMutation.error instanceof Error ? createMutation.error.message : null;

  return (
    <div>
      <h2 className="font-semibold text-ink-100 mb-1">Categories</h2>
      <p className="text-sm text-ink-500 mb-4">Organize inventory items into categories within your department.</p>
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
      </ul>
    </div>
  );
}
