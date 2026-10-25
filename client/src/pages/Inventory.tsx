import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useScope } from "../hooks/useScope";
import { Category, InventoryItem, TransactionType } from "../types";
import { RoleGate } from "../components/RoleGate";
import { Field, Modal, ModalActions } from "../components/Modal";
import { useT } from "../i18n";

export function Inventory() {
  const t = useT();
  const { selectedHotelId, selectedDepartmentId, viewingAllHotels, ready, params } = useScope();
  const queryClient = useQueryClient();
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [stockModalItem, setStockModalItem] = useState<InventoryItem | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["items", selectedHotelId, selectedDepartmentId],
    queryFn: () => api.get<InventoryItem[]>(`/items?${params()}`),
    enabled: ready,
  });

  // Stock numbers appear on several pages (lists, dashboards, low-stock alerts,
  // Analytics), so a change refreshes all of them, not just this list.
  function refreshStock() {
    for (const key of ["items", "transactions", "dashboard-summary", "my-work", "analytics"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  const categoriesQuery = useQuery({
    queryKey: ["categories", selectedDepartmentId],
    queryFn: () => api.get<Category[]>(`/categories?departmentId=${selectedDepartmentId}`),
    enabled: !!selectedDepartmentId,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-ink-100">{t("nav.inventory")}</h1>
        <RoleGate permission="edit_items">
          {viewingAllHotels ? (
            <span className="text-sm text-ink-500">{t("inv.selectHotel")}</span>
          ) : (
            <button onClick={() => setShowAddItem(true)} className="btn-primary">
              {t("inv.addItem")}
            </button>
          )}
        </RoleGate>
      </div>

      <div className="table-shell overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="px-4 py-2">{t("inv.col.name")}</th>
              {viewingAllHotels && <th className="px-4 py-2">{t("inv.col.hotel")}</th>}
              <th className="px-4 py-2">{t("inv.col.category")}</th>
              <th className="px-4 py-2">{t("inv.col.onHand")}</th>
              <th className="px-4 py-2">{t("inv.col.reorderPoint")}</th>
              <th className="px-4 py-2">{t("inv.col.location")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-800">
            {itemsQuery.data?.map((item) => (
              <tr key={item.id} className={item.quantityOnHand <= item.reorderPoint ? "bg-rose-500/10" : ""}>
                <td className="px-4 py-2 font-medium text-ink-100">{item.name}</td>
                {viewingAllHotels && (
                  <td className="px-4 py-2 text-ink-500 font-mono">{item.hotel?.code}</td>
                )}
                <td className="px-4 py-2 text-ink-500">{item.category?.name}</td>
                <td className="px-4 py-2 font-mono text-ink-200">
                  {item.quantityOnHand} {item.unit}
                </td>
                <td className="px-4 py-2 text-ink-500 font-mono">{item.reorderPoint}</td>
                <td className="px-4 py-2 text-ink-500">{item.location ?? "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setStockModalItem(item)} className="btn-ghost text-xs px-2.5 py-1.5">
                      {t("inv.adjustStock")}
                    </button>
                    <RoleGate permission="edit_items">
                      <button onClick={() => setEditingItem(item)} className="btn-ghost text-xs px-2.5 py-1.5">
                        {t("common.edit")}
                      </button>
                    </RoleGate>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {itemsQuery.data?.length === 0 && (
          <p className="text-sm text-ink-500 p-4">
            {viewingAllHotels ? t("inv.emptyAll") : t("inv.emptyHotel")}
          </p>
        )}
      </div>

      {(showAddItem || editingItem) && (
        <ItemModal
          item={editingItem ?? undefined}
          hotelId={selectedHotelId}
          departmentId={selectedDepartmentId}
          categories={categoriesQuery.data ?? []}
          onClose={() => {
            setShowAddItem(false);
            setEditingItem(null);
          }}
          onSaved={() => {
            setShowAddItem(false);
            setEditingItem(null);
            refreshStock();
          }}
        />
      )}

      {stockModalItem && (
        <StockModal
          item={stockModalItem}
          onClose={() => setStockModalItem(null)}
          onDone={() => {
            setStockModalItem(null);
            refreshStock();
          }}
        />
      )}
    </div>
  );
}

/** Adds an item, or edits one when `item` is given. On-hand stock only changes through stock movements. */
function ItemModal({
  item,
  hotelId,
  departmentId,
  categories,
  onClose,
  onSaved,
}: {
  item?: InventoryItem;
  hotelId: string;
  departmentId: string;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const editing = !!item;
  const [name, setName] = useState(item?.name ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "ea");
  const [quantityOnHand, setQuantityOnHand] = useState(0);
  const [reorderPoint, setReorderPoint] = useState(item?.reorderPoint ?? 0);
  const [maxLevel, setMaxLevel] = useState(item?.maxLevel != null ? String(item.maxLevel) : "");
  const [unitCost, setUnitCost] = useState(item?.unitCost ?? "");
  // Default to the first selectable option: a childless group, or the first subcategory.
  const firstSelectable =
    categories.find((c) => !c.parentId && !categories.some((child) => child.parentId === c.id)) ??
    categories.find((c) => c.parentId) ??
    categories[0];
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? firstSelectable?.id ?? "");
  const [location, setLocation] = useState(item?.location ?? "");

  const saveMutation = useMutation({
    mutationFn: () => {
      const fields = {
        name,
        // Blank clears these on an edit.
        sku: sku.trim() || null,
        unit,
        reorderPoint,
        // Blank clears these optional numbers.
        maxLevel: maxLevel === "" ? null : Number(maxLevel),
        unitCost: unitCost === "" ? null : Number(unitCost),
        categoryId,
        location: location.trim() || null,
      };
      return editing
        ? api.patch(`/items/${item!.id}`, fields)
        : api.post("/items", { ...fields, quantityOnHand, hotelId, departmentId });
    },
    onSuccess: onSaved,
  });

  return (
    <Modal title={editing ? t("inv.editTitle", { name: item!.name }) : t("inv.addItem")} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="space-y-3"
      >
        <Field label={t("field.name")}>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </Field>
        <Field label={t("field.category")}>
          <select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input-field">
            {categories
              .filter((c) => !c.parentId)
              .map((group) => {
                const children = categories.filter((c) => c.parentId === group.id);
                if (children.length === 0) {
                  return (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  );
                }
                return (
                  <optgroup key={group.id} label={group.name}>
                    {children.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("field.sku")}>
            <input value={sku} onChange={(e) => setSku(e.target.value)} className="input-field" />
          </Field>
          <Field label={t("field.unit")}>
            <input required value={unit} onChange={(e) => setUnit(e.target.value)} className="input-field" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {!editing && (
            <Field label={t("field.startingQuantity")}>
              <input
                type="number"
                min={0}
                value={quantityOnHand}
                onChange={(e) => setQuantityOnHand(Number(e.target.value))}
                className="input-field"
              />
            </Field>
          )}
          <Field label={t("field.reorderPoint")}>
            <input
              type="number"
              min={0}
              value={reorderPoint}
              onChange={(e) => setReorderPoint(Number(e.target.value))}
              className="input-field"
            />
          </Field>
          <Field label={t("field.maxLevel")}>
            <input type="number" min={0} value={maxLevel} onChange={(e) => setMaxLevel(e.target.value)} className="input-field" />
          </Field>
          <Field label={t("field.unitCost")}>
            <input
              type="number"
              min={0}
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="input-field"
            />
          </Field>
        </div>
        <Field label={t("field.location")}>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="input-field" />
        </Field>
        {editing && <p className="text-xs text-ink-500">{t("inv.stockViaMovements")}</p>}
        {saveMutation.isError && (
          <p className="text-sm text-rose-400">
            {saveMutation.error instanceof Error && saveMutation.error.message
              ? saveMutation.error.message
              : t("inv.createFailed")}
          </p>
        )}
        <ModalActions
          onClose={onClose}
          submitting={saveMutation.isPending}
          submitLabel={editing ? t("common.saveChanges") : t("inv.addItem")}
        />
      </form>
    </Modal>
  );
}

function StockModal({ item, onClose, onDone }: { item: InventoryItem; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [type, setType] = useState<TransactionType>("RECEIVE");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.post("/transactions", { itemId: item.id, type, quantity, notes: notes || undefined }),
    onSuccess: onDone,
  });

  return (
    <Modal title={t("inv.adjustTitle", { name: item.name })} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-3"
      >
        <p className="text-sm text-ink-500">
          {t("inv.currently", { quantity: item.quantityOnHand, unit: item.unit })}
        </p>
        <Field label={t("field.type")}>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TransactionType)}
            className="input-field"
          >
            <option value="RECEIVE">{t("inv.typeReceive")}</option>
            <option value="ISSUE">{t("inv.typeIssue")}</option>
            <option value="ADJUSTMENT">{t("inv.typeAdjust")}</option>
          </select>
        </Field>
        <Field label={type === "ADJUSTMENT" ? t("field.delta") : t("field.quantity")}>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="input-field"
          />
        </Field>
        <Field label={t("field.notes")}>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" />
        </Field>
        {mutation.isError && (
          <p className="text-sm text-rose-400">
            {mutation.error instanceof Error && mutation.error.message ? mutation.error.message : t("inv.saveFailed")}
          </p>
        )}
        <ModalActions onClose={onClose} submitting={mutation.isPending} submitLabel={t("common.save")} />
      </form>
    </Modal>
  );
}
