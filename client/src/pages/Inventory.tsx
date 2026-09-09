import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { ALL_HOTELS, useHotelScope } from "../context/HotelScopeContext";
import { useDepartmentScope } from "../context/DepartmentScopeContext";
import { Category, InventoryItem, TransactionType } from "../types";
import { RoleGate } from "../components/RoleGate";
import { Field, Modal, ModalActions } from "../components/Modal";

export function Inventory() {
  const { selectedHotelId } = useHotelScope();
  const { selectedDepartmentId } = useDepartmentScope();
  const viewingAllHotels = selectedHotelId === ALL_HOTELS;
  const queryClient = useQueryClient();
  const [showAddItem, setShowAddItem] = useState(false);
  const [stockModalItem, setStockModalItem] = useState<InventoryItem | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["items", selectedHotelId, selectedDepartmentId],
    queryFn: () => {
      const params = new URLSearchParams({ departmentId: selectedDepartmentId });
      if (!viewingAllHotels) params.set("hotelId", selectedHotelId);
      return api.get<InventoryItem[]>(`/items?${params}`);
    },
    enabled: !!selectedHotelId && !!selectedDepartmentId,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", selectedDepartmentId],
    queryFn: () => api.get<Category[]>(`/categories?departmentId=${selectedDepartmentId}`),
    enabled: !!selectedDepartmentId,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-ink-100">Inventory</h1>
        <RoleGate roles={["ADMIN", "MANAGER"]}>
          {viewingAllHotels ? (
            <span className="text-sm text-ink-500">Select a specific hotel to add items</span>
          ) : (
            <button onClick={() => setShowAddItem(true)} className="btn-primary">
              Add item
            </button>
          )}
        </RoleGate>
      </div>

      <div className="table-shell overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head-row">
            <tr>
              <th className="px-4 py-2">Name</th>
              {viewingAllHotels && <th className="px-4 py-2">Hotel</th>}
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">On hand</th>
              <th className="px-4 py-2">Reorder pt.</th>
              <th className="px-4 py-2">Location</th>
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
                <td className="px-4 py-2 text-right">
                  <button onClick={() => setStockModalItem(item)} className="btn-ghost text-xs px-2.5 py-1.5">
                    Adjust stock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {itemsQuery.data?.length === 0 && (
          <p className="text-sm text-ink-500 p-4">
            {viewingAllHotels ? "No items yet across any hotel." : "No items yet for this hotel."}
          </p>
        )}
      </div>

      {showAddItem && (
        <AddItemModal
          hotelId={selectedHotelId}
          departmentId={selectedDepartmentId}
          categories={categoriesQuery.data ?? []}
          onClose={() => setShowAddItem(false)}
          onCreated={() => {
            setShowAddItem(false);
            queryClient.invalidateQueries({ queryKey: ["items", selectedHotelId, selectedDepartmentId] });
          }}
        />
      )}

      {stockModalItem && (
        <StockModal
          item={stockModalItem}
          onClose={() => setStockModalItem(null)}
          onDone={() => {
            setStockModalItem(null);
            queryClient.invalidateQueries({ queryKey: ["items", selectedHotelId, selectedDepartmentId] });
            queryClient.invalidateQueries({ queryKey: ["transactions", selectedHotelId] });
          }}
        />
      )}
    </div>
  );
}

function AddItemModal({
  hotelId,
  departmentId,
  categories,
  onClose,
  onCreated,
}: {
  hotelId: string;
  departmentId: string;
  categories: Category[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("ea");
  const [quantityOnHand, setQuantityOnHand] = useState(0);
  const [reorderPoint, setReorderPoint] = useState(0);
  // Default to the first selectable option: a childless group, or the first subcategory.
  const firstSelectable =
    categories.find((c) => !c.parentId && !categories.some((child) => child.parentId === c.id)) ??
    categories.find((c) => c.parentId) ??
    categories[0];
  const [categoryId, setCategoryId] = useState(firstSelectable?.id ?? "");
  const [location, setLocation] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/items", {
        name,
        sku: sku || undefined,
        unit,
        quantityOnHand,
        reorderPoint,
        categoryId,
        location: location || undefined,
        hotelId,
        departmentId,
      }),
    onSuccess: onCreated,
  });

  return (
    <Modal title="Add item" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="space-y-3"
      >
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </Field>
        <Field label="Category">
          <select
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input-field"
          >
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
          <Field label="SKU (optional)">
            <input value={sku} onChange={(e) => setSku(e.target.value)} className="input-field" />
          </Field>
          <Field label="Unit">
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className="input-field" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starting quantity">
            <input
              type="number"
              min={0}
              value={quantityOnHand}
              onChange={(e) => setQuantityOnHand(Number(e.target.value))}
              className="input-field"
            />
          </Field>
          <Field label="Reorder point">
            <input
              type="number"
              min={0}
              value={reorderPoint}
              onChange={(e) => setReorderPoint(Number(e.target.value))}
              className="input-field"
            />
          </Field>
        </div>
        <Field label="Location (optional)">
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="input-field" />
        </Field>
        {createMutation.isError && <p className="text-sm text-rose-400">Could not create item.</p>}
        <ModalActions onClose={onClose} submitting={createMutation.isPending} submitLabel="Add item" />
      </form>
    </Modal>
  );
}

function StockModal({ item, onClose, onDone }: { item: InventoryItem; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<TransactionType>("RECEIVE");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.post("/transactions", { itemId: item.id, type, quantity, notes: notes || undefined }),
    onSuccess: onDone,
  });

  return (
    <Modal title={`Adjust stock · ${item.name}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-3"
      >
        <p className="text-sm text-ink-500">
          Currently {item.quantityOnHand} {item.unit} on hand.
        </p>
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TransactionType)}
            className="input-field"
          >
            <option value="RECEIVE">Receive (stock in)</option>
            <option value="ISSUE">Issue (stock out)</option>
            <option value="ADJUSTMENT">Adjustment (+/-)</option>
          </select>
        </Field>
        <Field label={type === "ADJUSTMENT" ? "Delta (use negative to reduce)" : "Quantity"}>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="input-field"
          />
        </Field>
        <Field label="Notes (optional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" />
        </Field>
        {mutation.isError && <p className="text-sm text-rose-400">Could not save transaction.</p>}
        <ModalActions onClose={onClose} submitting={mutation.isPending} submitLabel="Save" />
      </form>
    </Modal>
  );
}
