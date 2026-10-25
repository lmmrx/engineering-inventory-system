import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useScope } from "../hooks/useScope";
import { WorkOrder, WorkOrderStatus } from "../types";
import { Modal, ModalActions } from "../components/Modal";
import { useLocale, useT } from "../i18n";

const statusColor: Record<WorkOrderStatus, string> = {
  OPEN: "bg-amber-500/15 text-amber-300",
  IN_PROGRESS: "bg-blue-500/15 text-blue-300",
  COMPLETED: "bg-emerald-500/15 text-emerald-300",
};

export function WorkOrders() {
  const t = useT();
  const locale = useLocale();
  const { selectedHotelId, selectedDepartmentId, viewingAllHotels, ready, params } = useScope();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const workOrdersQuery = useQuery({
    queryKey: ["work-orders", selectedHotelId, selectedDepartmentId],
    queryFn: () => api.get<WorkOrder[]>(`/work-orders?${params()}`),
    enabled: ready,
  });

  function invalidate() {
    // The dashboards count and list work orders too.
    for (const key of ["work-orders", "my-work", "dashboard-summary"]) queryClient.invalidateQueries({ queryKey: [key] });
  }

  const advanceMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WorkOrderStatus }) =>
      api.patch(`/work-orders/${id}`, { status }),
    onSuccess: invalidate,
  });

  const nextStatus: Record<WorkOrderStatus, WorkOrderStatus | null> = {
    OPEN: "IN_PROGRESS",
    IN_PROGRESS: "COMPLETED",
    COMPLETED: null,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-ink-100">{t("nav.workOrders")}</h1>
        {viewingAllHotels ? (
          <span className="text-sm text-ink-500">{t("wo.selectHotel")}</span>
        ) : (
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            {t("wo.new")}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {workOrdersQuery.data?.map((wo) => {
          const next = nextStatus[wo.status];
          return (
            <div key={wo.id} className="card p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[wo.status]}`}>
                    {t(`wo.status.${wo.status}`)}
                  </span>
                  <span className="font-medium text-ink-100">{wo.title}</span>
                </div>
                {next && (
                  <button
                    onClick={() => advanceMutation.mutate({ id: wo.id, status: next })}
                    className="btn-ghost text-xs px-2.5 py-1.5"
                  >
                    {t(`wo.mark${next}` as "wo.markIN_PROGRESS" | "wo.markCOMPLETED")}
                  </button>
                )}
              </div>
              {wo.description && <p className="text-sm text-ink-300">{wo.description}</p>}
              <p className="text-xs text-ink-600 mt-1">
                {t("wo.createdBy", { name: wo.createdBy?.name ?? "", date: new Date(wo.createdAt).toLocaleDateString(locale) })}
                {wo.assignedTo && t("wo.assignedTo", { name: wo.assignedTo.name })}
                {viewingAllHotels && wo.hotel && <span className="font-mono"> · {wo.hotel.code}</span>}
              </p>
            </div>
          );
        })}
        {workOrdersQuery.data?.length === 0 && (
          <p className="text-sm text-ink-500">
            {viewingAllHotels ? t("wo.emptyAll") : t("wo.emptyHotel")}
          </p>
        )}
      </div>

      {showCreate && (
        <CreateWorkOrderModal
          hotelId={selectedHotelId}
          departmentId={selectedDepartmentId}
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

function CreateWorkOrderModal({
  hotelId,
  departmentId,
  onClose,
  onCreated,
}: {
  hotelId: string;
  departmentId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/work-orders", { title, description: description || undefined, hotelId, departmentId }),
    onSuccess: onCreated,
  });

  return (
    <Modal title={t("wo.new")} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="label-field">{t("field.title")}</span>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" />
        </label>
        <label className="block">
          <span className="label-field">{t("field.description")}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field"
            rows={3}
          />
        </label>
        {createMutation.isError && <p className="text-sm text-rose-400">{t("wo.createFailed")}</p>}
        <ModalActions onClose={onClose} submitting={createMutation.isPending} submitLabel={t("common.create")} />
      </form>
    </Modal>
  );
}
