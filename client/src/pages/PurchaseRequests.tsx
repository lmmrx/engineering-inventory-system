import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useScope } from "../hooks/useScope";
import { useAuth } from "../context/AuthContext";
import { InventoryItem, PurchaseRequest } from "../types";
import { RoleGate } from "../components/RoleGate";
import { Modal, ModalActions } from "../components/Modal";
import { useLocale, useT } from "../i18n";

const statusColor: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-300",
  APPROVED: "bg-blue-500/15 text-blue-300",
  REJECTED: "bg-rose-500/15 text-rose-300",
  RECEIVED: "bg-emerald-500/15 text-emerald-300",
};

export function PurchaseRequests() {
  const t = useT();
  const { user } = useAuth();
  const locale = useLocale();
  const { selectedHotelId, selectedDepartmentId, viewingAllHotels, ready, params } = useScope();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const requestsQuery = useQuery({
    queryKey: ["purchase-requests", selectedHotelId, selectedDepartmentId],
    queryFn: () => api.get<PurchaseRequest[]>(`/purchase-requests?${params()}`),
    enabled: ready,
  });

  const itemsQuery = useQuery({
    queryKey: ["items", selectedHotelId, selectedDepartmentId],
    // Shares the Inventory page's cache; only needed when a specific hotel is picked.
    queryFn: () => api.get<InventoryItem[]>(`/items?${params()}`),
    enabled: ready && !viewingAllHotels,
  });

  const [actionError, setActionError] = useState<string | null>(null);

  function invalidate() {
    // Receiving changes stock, which several pages show.
    for (const key of ["purchase-requests", "items", "transactions", "dashboard-summary", "my-work", "analytics"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  function handleActionError(err: unknown) {
    setActionError(err instanceof Error && err.message ? err.message : t("common.somethingWrong"));
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
        <h1 className="text-lg font-semibold text-ink-100">{t("nav.purchaseRequests")}</h1>
        {viewingAllHotels ? (
          <span className="text-sm text-ink-500">{t("pr.selectHotel")}</span>
        ) : (
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            {t("pr.new")}
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
                  {t(`pr.status.${pr.status}`)}
                </span>
                <span className="text-sm text-ink-500">
                  {t("pr.requestedBy", { name: pr.requestedBy?.name ?? "", date: new Date(pr.createdAt).toLocaleDateString(locale) })}
                  {viewingAllHotels && pr.hotel && (
                    <span className="font-mono"> · {pr.hotel.code}</span>
                  )}
                </span>
              </div>
              <RoleGate permission="approve_requests">
                {/* Someone else approves a request (Admins excepted), as the server enforces. */}
                {pr.status === "PENDING" && (pr.requestedBy?.id !== user?.id || user?.role === "ADMIN") && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveMutation.mutate(pr.id)}
                      className="text-xs px-2 py-1 rounded-md border border-emerald-700/60 text-emerald-300 hover:bg-emerald-500/10"
                    >
                      {t("pr.approve")}
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate(pr.id)}
                      className="text-xs px-2 py-1 rounded-md border border-rose-700/60 text-rose-300 hover:bg-rose-500/10"
                    >
                      {t("pr.reject")}
                    </button>
                  </div>
                )}
              </RoleGate>
              {pr.status === "APPROVED" && (
                  <button
                    onClick={() => receiveMutation.mutate(pr)}
                    className="text-xs px-2 py-1 rounded-md border border-blue-700/60 text-blue-300 hover:bg-blue-500/10"
                  >
                    {t("pr.markReceived")}
                  </button>
                )}
            </div>
            <ul className="text-sm text-ink-300 space-y-1">
              {pr.items.map((line) => (
                <li key={line.id}>
                  {t("pr.lineRequested", { item: line.item?.name ?? line.itemId, count: line.quantityRequested })}
                  {line.quantityReceived > 0 && t("pr.lineReceived", { count: line.quantityReceived })}
                </li>
              ))}
            </ul>
            {pr.notes && <p className="text-sm text-ink-500 mt-2">{pr.notes}</p>}
          </div>
        ))}
        {requestsQuery.data?.length === 0 && (
          <p className="text-sm text-ink-500">
            {viewingAllHotels ? t("pr.emptyAll") : t("pr.emptyHotel")}
          </p>
        )}
      </div>

      {showCreate && (
        <CreateRequestModal
          hotelId={selectedHotelId}
          departmentId={selectedDepartmentId}
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
  const t = useT();
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
      <Modal title={t("pr.newTitle")} onClose={onClose} maxWidth="max-w-lg">
        <p className="text-sm text-ink-300">
          {t("pr.noItems")}
        </p>
        <p className="text-sm text-ink-500 mt-2">
          {t("pr.noItemsHint")}
        </p>
        <div className="flex justify-end pt-4">
          <button onClick={onClose} className="btn-ghost">
            {t("common.close")}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t("pr.newTitle")} onClose={onClose} maxWidth="max-w-lg">
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
          {t("pr.addLine")}
        </button>

        <label className="block">
          <span className="label-field">{t("field.notes")}</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" />
        </label>

        {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}

        <ModalActions onClose={onClose} submitting={createMutation.isPending} submitLabel={t("pr.submit")} />
      </form>
    </Modal>
  );
}
