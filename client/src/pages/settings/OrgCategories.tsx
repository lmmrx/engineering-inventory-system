import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useDepartmentScope } from "../../context/DepartmentScopeContext";
import { Category } from "../../types";
import { Field, Modal, ModalActions } from "../../components/Modal";

export function OrgCategories() {
  const { departments, selectedDepartmentId } = useDepartmentScope();
  const queryClient = useQueryClient();
  const [modalState, setModalState] = useState<
    { mode: "create-group" } | { mode: "create-sub"; parentId: string } | { mode: "edit"; category: Category } | null
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const departmentName = departments.find((d) => d.id === selectedDepartmentId)?.name ?? "";

  const categoriesQuery = useQuery({
    queryKey: ["categories", selectedDepartmentId],
    queryFn: () => api.get<Category[]>(`/categories?departmentId=${selectedDepartmentId}`),
    enabled: !!selectedDepartmentId,
  });

  const groups = (categoriesQuery.data ?? []).filter((c) => !c.parentId);
  const childrenOf = (groupId: string) => (categoriesQuery.data ?? []).filter((c) => c.parentId === groupId);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["categories", selectedDepartmentId] });
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      setDeleteError(null);
      invalidate();
    },
    onError: (err: unknown) => setDeleteError(err instanceof Error ? err.message : "Could not delete category."),
  });

  function handleDelete(category: Category, hasChildren: boolean) {
    const label = hasChildren ? "this group and all its subcategories" : "this category";
    if (window.confirm(`Delete ${label}? This can't be undone.`)) {
      deleteMutation.mutate(category.id);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-ink-100">Categories</h2>
        <button onClick={() => setModalState({ mode: "create-group" })} className="btn-primary">
          Add group
        </button>
      </div>
      <p className="text-sm text-ink-500 mb-4">
        Organize inventory items within <span className="text-ink-300">{departmentName}</span>. Switch departments
        from the account menu to manage a different one.
      </p>

      {deleteError && <p className="text-sm text-rose-400 mb-4">{deleteError}</p>}

      <div className="space-y-3">
        {groups.map((group) => {
          const children = childrenOf(group.id);
          return (
            <div key={group.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-ink-100">{group.name}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModalState({ mode: "create-sub", parentId: group.id })}
                    className="btn-ghost text-xs px-2.5 py-1.5"
                  >
                    Add subcategory
                  </button>
                  <button
                    onClick={() => setModalState({ mode: "edit", category: group })}
                    className="btn-ghost text-xs px-2.5 py-1.5"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(group, children.length > 0)}
                    className="text-xs px-2.5 py-1.5 rounded-md border border-rose-700/60 text-rose-300 hover:bg-rose-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {children.length > 0 ? (
                <ul className="divide-y divide-navy-800 -mx-4">
                  {children.map((sub) => (
                    <li key={sub.id} className="px-4 py-2 flex items-center justify-between text-sm">
                      <span className="text-ink-200">{sub.name}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setModalState({ mode: "edit", category: sub })}
                          className="btn-ghost text-xs px-2 py-1"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(sub, false)}
                          className="text-xs px-2 py-1 rounded-md border border-rose-700/60 text-rose-300 hover:bg-rose-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-600">No subcategories yet — items can still be filed under {group.name} directly.</p>
              )}
            </div>
          );
        })}
        {groups.length === 0 && (
          <p className="text-sm text-ink-500">No categories yet in this department.</p>
        )}
      </div>

      {modalState && (
        <CategoryModal
          state={modalState}
          departmentId={selectedDepartmentId}
          groups={groups}
          onClose={() => setModalState(null)}
          onSaved={() => {
            setModalState(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function CategoryModal({
  state,
  departmentId,
  groups,
  onClose,
  onSaved,
}: {
  state: { mode: "create-group" } | { mode: "create-sub"; parentId: string } | { mode: "edit"; category: Category };
  departmentId: string;
  groups: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = state.mode === "edit";
  const [name, setName] = useState(isEdit ? state.category.name : "");
  const [parentId, setParentId] = useState<string>(
    state.mode === "create-sub" ? state.parentId : isEdit ? state.category.parentId ?? "" : ""
  );

  const title = state.mode === "create-group" ? "Add group" : state.mode === "create-sub" ? "Add subcategory" : "Edit category";

  const saveMutation = useMutation({
    mutationFn: () =>
      isEdit
        ? api.patch(`/categories/${state.category.id}`, { name, parentId: parentId || null })
        : api.post("/categories", { name, departmentId, parentId: parentId || null }),
    onSuccess: onSaved,
  });

  const errorMessage = saveMutation.error instanceof Error ? saveMutation.error.message : null;

  // When editing a group (a category with no parent), don't let it become a
  // subcategory of itself, and the backend already blocks nesting a group
  // that has children — that error will surface here if it's attempted.
  const parentOptions = groups.filter((g) => !(isEdit && g.id === state.category.id));

  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="space-y-3"
      >
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </Field>
        <Field label="Group (leave as top-level for a new group)">
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="input-field">
            <option value="">— Top-level group —</option>
            {parentOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}
        <ModalActions onClose={onClose} submitting={saveMutation.isPending} submitLabel="Save" />
      </form>
    </Modal>
  );
}
