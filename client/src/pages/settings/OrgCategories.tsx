import { KeyboardEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useDepartmentScope } from "../../context/DepartmentScopeContext";
import { Category } from "../../types";

type CategoryWithCount = Category & { itemCount: number };

/** Where a new category is being typed in: a new group, or a subcategory under a group. */
type Adding = { parentId: string | null } | null;

/**
 * Categories for the selected department, as one list: each group with its
 * subcategories under it. Everything is edited in place — no pop-ups.
 */
export function OrgCategories() {
  const { departments, selectedDepartmentId } = useDepartmentScope();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<Adding>(null);
  const [error, setError] = useState<string | null>(null);

  const departmentName = departments.find((d) => d.id === selectedDepartmentId)?.name ?? "";

  const categoriesQuery = useQuery({
    queryKey: ["categories", selectedDepartmentId],
    queryFn: () => api.get<CategoryWithCount[]>(`/categories?departmentId=${selectedDepartmentId}`),
    enabled: !!selectedDepartmentId,
  });

  const all = categoriesQuery.data ?? [];
  const groups = all.filter((c) => !c.parentId);
  const childrenOf = (groupId: string) => all.filter((c) => c.parentId === groupId);

  const onDone = () => {
    setError(null);
    setEditingId(null);
    setAdding(null);
    // Also refreshes the category pickers on the Inventory page.
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  };
  const onFail = (err: unknown) => setError(err instanceof Error && err.message ? err.message : "Could not save.");

  const createMutation = useMutation({
    mutationFn: (body: { name: string; parentId: string | null }) =>
      api.post("/categories", { ...body, departmentId: selectedDepartmentId }),
    onSuccess: onDone,
    onError: onFail,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; parentId: string | null }) =>
      api.patch(`/categories/${id}`, body),
    onSuccess: onDone,
    onError: onFail,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: onDone,
    onError: onFail,
  });

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  function startEditing(id: string) {
    setError(null);
    setAdding(null);
    setEditingId(id);
  }
  function startAdding(parentId: string | null) {
    setError(null);
    setEditingId(null);
    setAdding({ parentId });
  }
  function remove(category: CategoryWithCount, subcategories: CategoryWithCount[]) {
    const what =
      subcategories.length > 0
        ? `the group "${category.name}" and its ${subcategories.length} subcategories`
        : `"${category.name}"`;
    if (window.confirm(`Delete ${what}? This can't be undone.`)) deleteMutation.mutate(category.id);
  }

  return (
    <div>
      <h2 className="font-semibold text-ink-100 mb-1">Categories</h2>
      <p className="text-sm text-ink-500 mb-4">
        How items are organized in <span className="text-ink-300">{departmentName}</span>: groups, each with optional
        subcategories. Items can be filed under either. Switch departments from the account menu to manage another one.
      </p>

      {error && <p className="text-sm text-rose-400 mb-3">{error}</p>}

      <div className="card divide-y divide-navy-800">
        {groups.map((group) => {
          const subcategories = childrenOf(group.id);
          const itemsInGroup = group.itemCount + subcategories.reduce((sum, c) => sum + c.itemCount, 0);
          return (
            <div key={group.id} className="py-1">
              <CategoryRow
                category={group}
                itemCount={itemsInGroup}
                isGroup
                hasSubcategories={subcategories.length > 0}
                groups={groups}
                editing={editingId === group.id}
                busy={busy}
                onEdit={() => startEditing(group.id)}
                onCancel={() => setEditingId(null)}
                onSave={(name, parentId) => updateMutation.mutate({ id: group.id, name, parentId })}
                onDelete={() => remove(group, subcategories)}
              />
              {subcategories.map((sub) => (
                <CategoryRow
                  key={sub.id}
                  category={sub}
                  itemCount={sub.itemCount}
                  groups={groups}
                  editing={editingId === sub.id}
                  busy={busy}
                  onEdit={() => startEditing(sub.id)}
                  onCancel={() => setEditingId(null)}
                  onSave={(name, parentId) => updateMutation.mutate({ id: sub.id, name, parentId })}
                  onDelete={() => remove(sub, [])}
                />
              ))}
              {adding?.parentId === group.id ? (
                <NameInput
                  indent
                  placeholder={`New subcategory in ${group.name}`}
                  busy={busy}
                  onSave={(name) => createMutation.mutate({ name, parentId: group.id })}
                  onCancel={() => setAdding(null)}
                />
              ) : (
                <button
                  onClick={() => startAdding(group.id)}
                  className="ml-8 sm:ml-10 my-1 text-xs text-gold-400 hover:text-gold-300"
                >
                  + Add subcategory
                </button>
              )}
            </div>
          );
        })}

        {groups.length === 0 && categoriesQuery.isSuccess && (
          <p className="px-4 py-3 text-sm text-ink-500">No categories yet in this department.</p>
        )}

        <div className="py-2">
          {adding?.parentId === null ? (
            <NameInput
              placeholder="New group name"
              busy={busy}
              onSave={(name) => createMutation.mutate({ name, parentId: null })}
              onCancel={() => setAdding(null)}
            />
          ) : (
            <button onClick={() => startAdding(null)} className="px-4 text-sm font-medium text-gold-400 hover:text-gold-300">
              + Add group
            </button>
          )}
        </div>
      </div>

      {groups.length > 0 && (
        <p className="text-xs text-ink-500 mt-2">
          {groups.length} groups · {all.length - groups.length} subcategories. A category can only be deleted once it has
          no items.
        </p>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  itemCount,
  isGroup = false,
  hasSubcategories = false,
  groups,
  editing,
  busy,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  category: CategoryWithCount;
  itemCount: number;
  isGroup?: boolean;
  hasSubcategories?: boolean;
  groups: CategoryWithCount[];
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (name: string, parentId: string | null) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [parentId, setParentId] = useState(category.parentId ?? "");

  if (editing) {
    // A group that has subcategories must stay a group: only one level of nesting is allowed.
    const canMove = !hasSubcategories;
    const save = () => name.trim() && onSave(name.trim(), parentId || null);
    return (
      <div className={`px-4 py-2 flex flex-col sm:flex-row sm:items-center gap-2 bg-navy-850 ${isGroup ? "" : "sm:pl-10"}`}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => handleKeys(e, save, onCancel)}
          className="input-field py-1.5 sm:flex-1"
          aria-label="Category name"
        />
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          disabled={!canMove}
          className="input-field py-1.5 sm:w-56 disabled:opacity-60"
          aria-label="Group"
          title={canMove ? "Which group it belongs to" : "Move or delete its subcategories first"}
        >
          <option value="">Top-level group</option>
          {groups
            .filter((g) => g.id !== category.id)
            .map((g) => (
              <option key={g.id} value={g.id}>
                In {g.name}
              </option>
            ))}
        </select>
        <div className="flex gap-2">
          <button onClick={save} disabled={busy || !name.trim()} className="btn-primary text-xs px-3 py-1.5">
            Save
          </button>
          <button onClick={onCancel} className="btn-ghost text-xs px-3 py-1.5">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group px-4 py-1.5 flex items-center gap-3 ${isGroup ? "" : "pl-8 sm:pl-10"}`}>
      {/* Long names wrap on phones rather than being cut off. */}
      <span className={`flex-1 min-w-0 break-words ${isGroup ? "font-medium text-ink-100" : "text-sm text-ink-200"}`}>
        {category.name}
      </span>
      <span className="text-xs text-ink-500 tabular-nums whitespace-nowrap">
        {itemCount === 0 ? "No items" : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
      </span>
      <div className="flex gap-1 flex-none">
        <button
          onClick={() => {
            setName(category.name);
            setParentId(category.parentId ?? "");
            onEdit();
          }}
          className="btn-ghost text-xs px-2 py-1"
          aria-label={`Edit ${category.name}`}
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          disabled={busy || itemCount > 0}
          title={itemCount > 0 ? `Move or remove its ${itemCount} item${itemCount === 1 ? "" : "s"} first` : undefined}
          className="text-xs px-2 py-1 rounded-md border border-rose-700/60 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          aria-label={`Delete ${category.name}`}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function NameInput({
  placeholder,
  indent = false,
  busy,
  onSave,
  onCancel,
}: {
  placeholder: string;
  indent?: boolean;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const save = () => name.trim() && onSave(name.trim());
  return (
    <div className={`px-4 py-2 flex items-center gap-2 ${indent ? "pl-8 sm:pl-10" : ""}`}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => handleKeys(e, save, onCancel)}
        placeholder={placeholder}
        className="input-field py-1.5 flex-1 min-w-0"
        aria-label={placeholder}
      />
      <button onClick={save} disabled={busy || !name.trim()} className="btn-primary text-xs px-3 py-1.5 flex-none">
        Add
      </button>
      <button onClick={onCancel} className="btn-ghost text-xs px-3 py-1.5 flex-none">
        Cancel
      </button>
    </div>
  );
}

/** Enter saves, Escape cancels. */
function handleKeys(e: KeyboardEvent, save: () => void, cancel: () => void) {
  if (e.key === "Enter") {
    e.preventDefault();
    save();
  } else if (e.key === "Escape") {
    cancel();
  }
}
