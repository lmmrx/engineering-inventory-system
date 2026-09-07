import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ALL_HOTELS, useHotelScope } from "../context/HotelScopeContext";
import { InventoryItem, PurchaseRequest } from "../types";
import { RoleGate } from "../components/RoleGate";
import { Modal, ModalActions } from "../components/Modal";

const statusColor: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-300",
  APPROVED: "bg-blue-500/15 text-blue-300",
  REJECTED: "bg-rose-500/15 text-rose-300",
  RECEIVED: "bg-emerald-500/15 text-emerald-300",
};

export function PurchaseRequests() {
  const { selectedHotelId } = useHotelScope();
  const viewingAllHotels = selectedHotelId === ALL_HOTELS;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const requestsQuery = useQuery({
    queryKey: ["purchase-requests", selectedHotelId],
    queryFn: () =>
      api.get<PurchaseRequest[]>(`/purchase-requests${viewingAllHotels ? "" : `?hotelId=${selectedHotelId}`}`),
    enabled: !!selectedHotelId,
  });

  const itemsQuery = useQuery({
    queryKey: ["items", selectedHotelId],
    queryFn: () => api.get<InventoryItem[]>(`/items${viewingAllHotels ? "" : `?hotelId=${selectedHotelId}`}`),
    enabled: !!selectedHotelId && !viewingAllHotels,
  });

  const [actionError, setActionError] = useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["purchase-requests", selectedHotelId] });
    queryClient.invalidateQueries({ queryKey: ["items", selectedHotelId] });
  }

  function handleActionError(err: unknown) {
    setActionError(err instanceof Error ? err.message : "Something went wrong.");
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/purchase-requests/${id}/approve`),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: handleActionError,
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/purchase-requests/${id}/reject`),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: handleActionError,
  });
  const receiveMutation = useMutation({
    mutationFn: (pr: PurchaseRequest) =>
      api.patch(`/purchase-requests/${pr.id}/receive`, {
        items: pr.items.map((i) => ({
          purchaseRequestItemId: i.id,
          quantityReceived: i.quantityRequested - i.quantityReceived,
        })),
      }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: handleActionError,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-ink-100">Purchase Requests</h1>
        {viewingAllHotels ? (
          <span className="text-sm text-ink-500">Select a specific hotel to create a request</span>
        ) : (
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            New request
          </button>
        )}
      </div>

      {actionError && <p className="text-sm text-rose-400 mb-4">{actionError}</p>}

      <div className="space-y-3">
        {requestsQuery.data?.map((pr) => (
          <div key={pr.id} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[pr.status]}`}>
                  {pr.status}
                </span>
                <span className="text-sm text-ink-500">
                  Requested by {pr.requestedBy?.name} on {new Date(pr.createdAt).toLocaleDateString()}
                  {viewingAllHotels && pr.hotel && <> · {pr.hotel.name}</>}
                </span>
              </div>
              <RoleGate roles={["ADMIN", "MANAGER"]}>
                {pr.status === "PENDING" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveMutation.mutate(pr.id)}
                      className="text-xs px-2 py-1 rounded-md border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate(pr.id)}
                      className="text-xs px-2 py-1 rounded-md border border-rose-700/60 text-rose-300 hover:bg-rose-500/10"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {pr.status === "APPROVED" && (
                  <button
                    onClick={() => receiveMutation.mutate(pr)}
                    className="text-xs px-2 py-1 rounded-md border border-blue-700/60 text-blue-300 hover:bg-blue-500/10"
                  >
                    Mark received
                  </button>
                )}
              </RoleGate>
            </div>
            <ul className="text-sm text-ink-300 space-y-1">
              {pr.items.map((line) => (
                <li key={line.id}>
                  {line.item?.name ?? line.itemId} — {line.quantityRequested} requested
                  {line.quantityReceived > 0 && `, ${line.quantityReceived} received`}
                </li>
              ))}
            </ul>
            {pr.notes && <p className="text-sm text-ink-500 mt-2">{pr.notes}</p>}
          </div>
        ))}
        {requestsQuery.data?.length === 0 && (
          <p className="text-sm text-ink-500">
            {viewingAllHotels ? "No purchase requests across any hotel yet." : "No purchase requests for this hotel yet."}
          </p>
        )}
      </div>

      {showCreate && (
        <CreateRequestModal
          hotelId={selectedHotelId}
          departmentId={user!.departmentId!}
          items={itemsQuery.data ?? []}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function CreateRequestModal({
  hotelId,
  departmentId,
  items,
  onClose,
  onCreated,
}: {
  hotelId: string;
  departmentId: string;
  items: InventoryItem[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [lines, setLines] = useState<{ itemId: string; quantityRequested: number }[]>([
    { itemId: items[0]?.id ?? "", quantityRequested: 1 },
  ]);
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/purchase-requests", {
        hotelId,
        departmentId,
        notes: notes || undefined,
        items: lines.filter((l) => l.itemId),
      }),
    onSuccess: onCreated,
  });

  function updateLine(index: number, patch: Partial<{ itemId: string; quantityRequested: number }>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  const errorMessage = createMutation.error instanceof Error ? createMutation.error.message : null;

  if (items.length === 0) {
    return (
      <Modal title="New purchase request" onClose={onClose} maxWidth="max-w-lg">
        <p className="text-sm text-ink-300">
          This hotel doesn't have any inventory items yet, so there's nothing to request.
        </p>
        <p className="text-sm text-ink-500 mt-2">
          Add items on the Inventory page first, then come back to submit a request.
        </p>
        <div className="flex justify-end pt-4">
          <button onClick={onClose} className="btn-ghost">
            Close
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="New purchase request" onClose={onClose} maxWidth="max-w-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="space-y-3"
      >
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2">
            <select
              required
              value={line.itemId}
              onChange={(e) => updateLine(i, { itemId: e.target.value })}
              className="input-field flex-1"
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={line.quantityRequested}
              onChange={(e) => updateLine(i, { quantityRequested: Number(e.target.value) })}
              className="input-field w-24"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, { itemId: items[0]?.id ?? "", quantityRequested: 1 }])}
          className="text-sm text-gold-400 hover:text-gold-300 underline"
        >
          + Add another item
        </button>

        <label className="block">
          <span className="label-field">Notes (optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" />
        </label>

        {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}

        <ModalActions onClose={onClose} submitting={createMutation.isPending} submitLabel="Submit request" />
      </form>
    </Modal>
  );
}
