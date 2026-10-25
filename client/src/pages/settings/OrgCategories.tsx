import { KeyboardEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useDepartmentScope } from "../../context/DepartmentScopeContext";
import { Category } from "../../types";
import { useT } from "../../i18n";

type CategoryWithCount = Category & { itemCount: number };

/** Where a new category is being typed in: a new group, or a subcategory under a group. */
type Adding = { parentId: string | null } | null;

/**
 * Categories for the selected department, as one list: each group with its
 * subcategories under it. Everything is edited in place — no pop-ups.
 */
export function OrgCategories() {
  const { departments, selectedDepartmentId } = useDepartmentScope();
  const t = useT();
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
  const onFail = (err: unknown) => setError(err instanceof Error && err.message ? err.message : t("cat.saveFailed"));

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
    const question =
      subcategories.length > 0
        ? t("cat.deleteGroupConfirm", { name: category.name, count: subcategories.length })
        : t("cat.deleteConfirm", { name: category.name });
    if (window.confirm(question)) deleteMutation.mutate(category.id);
  }

  return (
    <div>
      <h2 className="font-semibold text-ink-100 mb-1">{t("settings.categories")}</h2>
      <p className="text-sm text-ink-500 mb-4">
        {t("cat.description", { department: departmentName })}
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
                  placeholder={t("cat.newSubcategory", { group: group.name })}
                  busy={busy}
                  onSave={(name) => createMutation.mutate({ name, parentId: group.id })}
                  onCancel={() => setAdding(null)}
                />
              ) : (
                <button
                  onClick={() => startAdding(group.id)}
                  className="ms-8 sm:ms-10 my-1 text-xs text-gold-400 hover:text-gold-300"
                >
                  {t("cat.addSubcategory")}
                </button>
              )}
            </div>
          );
        })}

        {groups.length === 0 && categoriesQuery.isSuccess && (
          <p className="px-4 py-3 text-sm text-ink-500">{t("cat.empty")}</p>
        )}

        <div className="py-2">
          {adding?.parentId === null ? (
            <NameInput
              placeholder={t("cat.newGroup")}
              busy={busy}
              onSave={(name) => createMutation.mutate({ name, parentId: null })}
              onCancel={() => setAdding(null)}
            />
          ) : (
            <button onClick={() => startAdding(null)} className="px-4 text-sm font-medium text-gold-400 hover:text-gold-300">
              {t("cat.addGroup")}
            </button>
          )}
        </div>
      </div>

      {groups.length > 0 && (
        <p className="text-xs text-ink-500 mt-2">
          {t("cat.summary", { groups: groups.length, subcategories: all.length - groups.length })}
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
  const t = useT();
  const [name, setName] = useState(category.name);
  const [parentId, setParentId] = useState(category.parentId ?? "");

  if (editing) {
    // A group that has subcategories must stay a group: only one level of nesting is allowed.
    const canMove = !hasSubcategories;
    const save = () => name.trim() && onSave(name.trim(), parentId || null);
    return (
      <div className={`px-4 py-2 flex flex-col sm:flex-row sm:items-center gap-2 bg-navy-850 ${isGroup ? "" : "sm:ps-10"}`}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => handleKeys(e, save, onCancel)}
          className="input-field py-1.5 sm:flex-1"
          aria-label={t("cat.name")}
        />
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          disabled={!canMove}
          className="input-field py-1.5 sm:w-56 disabled:opacity-60"
          aria-label={t("cat.group")}
          title={canMove ? t("cat.groupHint") : t("cat.mustStayGroup")}
        >
          <option value="">{t("cat.topLevel")}</option>
          {groups
            .filter((g) => g.id !== category.id)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {t("cat.inGroup", { group: g.name })}
              </option>
            ))}
        </select>
        <div className="flex gap-2">
          <button onClick={save} disabled={busy || !name.trim()} className="btn-primary text-xs px-3 py-1.5">
            {t("common.save")}
          </button>
          <button onClick={onCancel} className="btn-ghost text-xs px-3 py-1.5">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group px-4 py-1.5 flex items-center gap-3 ${isGroup ? "" : "ps-8 sm:ps-10"}`}>
      {/* Long names wrap on phones rather than being cut off. */}
      <span className={`flex-1 min-w-0 break-words ${isGroup ? "font-medium text-ink-100" : "text-sm text-ink-200"}`}>
        {category.name}
      </span>
      <span className="text-xs text-ink-500 tabular-nums whitespace-nowrap">
        {itemCount === 0 ? t("cat.noItems") : itemCount === 1 ? t("cat.oneItem") : t("cat.items", { count: itemCount })}
      </span>
      <div className="flex gap-1 flex-none">
        <button
          onClick={() => {
            setName(category.name);
            setParentId(category.parentId ?? "");
            onEdit();
          }}
          className="btn-ghost text-xs px-2 py-1"
          aria-label={t("cat.editLabel", { name: category.name })}
        >
          {t("common.edit")}
        </button>
        <button
          onClick={onDelete}
          disabled={busy || itemCount > 0}
          title={itemCount > 0 ? t("cat.deleteBlocked", { count: itemCount }) : undefined}
          className="text-xs px-2 py-1 rounded-md border border-rose-700/60 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          aria-label={t("cat.deleteLabel", { name: category.name })}
        >
          {t("common.delete")}
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
  const t = useT();
  const [name, setName] = useState("");
  const save = () => name.trim() && onSave(name.trim());
  return (
    <div className={`px-4 py-2 flex items-center gap-2 ${indent ? "ps-8 sm:ps-10" : ""}`}>
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
        {t("common.add")}
      </button>
      <button onClick={onCancel} className="btn-ghost text-xs px-3 py-1.5 flex-none">
        {t("common.cancel")}
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
