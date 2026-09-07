import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ALL_HOTELS, useHotelScope } from "../context/HotelScopeContext";
import { WorkOrder, WorkOrderStatus } from "../types";
import { Modal, ModalActions } from "../components/Modal";

const statusColor: Record<WorkOrderStatus, string> = {
  OPEN: "bg-amber-500/15 text-amber-300",
  IN_PROGRESS: "bg-blue-500/15 text-blue-300",
  COMPLETED: "bg-emerald-500/15 text-emerald-300",
};

export function WorkOrders() {
  const { selectedHotelId } = useHotelScope();
  const viewingAllHotels = selectedHotelId === ALL_HOTELS;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const workOrdersQuery = useQuery({
    queryKey: ["work-orders", selectedHotelId],
    queryFn: () => api.get<WorkOrder[]>(`/work-orders${viewingAllHotels ? "" : `?hotelId=${selectedHotelId}`}`),
    enabled: !!selectedHotelId,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["work-orders", selectedHotelId] });
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
        <h1 className="text-lg font-semibold text-ink-100">Work Orders</h1>
        {viewingAllHotels ? (
          <span className="text-sm text-ink-500">Select a specific hotel to create a work order</span>
        ) : (
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            New work order
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
                    {wo.status.replace("_", " ")}
                  </span>
                  <span className="font-medium text-ink-100">{wo.title}</span>
                </div>
                {next && (
                  <button
                    onClick={() => advanceMutation.mutate({ id: wo.id, status: next })}
                    className="btn-ghost text-xs px-2.5 py-1.5"
                  >
                    Mark {next.replace("_", " ").toLowerCase()}
                  </button>
                )}
              </div>
              {wo.description && <p className="text-sm text-ink-300">{wo.description}</p>}
              <p className="text-xs text-ink-600 mt-1">
                Created by {wo.createdBy?.name} · {new Date(wo.createdAt).toLocaleDateString()}
                {wo.assignedTo && ` · Assigned to ${wo.assignedTo.name}`}
                {viewingAllHotels && wo.hotel && <span className="font-mono"> · {wo.hotel.code}</span>}
              </p>
            </div>
          );
        })}
        {workOrdersQuery.data?.length === 0 && (
          <p className="text-sm text-ink-500">
            {viewingAllHotels ? "No work orders across any hotel yet." : "No work orders yet."}
          </p>
        )}
      </div>

      {showCreate && (
        <CreateWorkOrderModal
          hotelId={selectedHotelId}
          departmentId={user!.departmentId!}
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/work-orders", { title, description: description || undefined, hotelId, departmentId }),
    onSuccess: onCreated,
  });

  return (
    <Modal title="New work order" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="label-field">Title</span>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" />
        </label>
        <label className="block">
          <span className="label-field">Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field"
            rows={3}
          />
        </label>
        {createMutation.isError && <p className="text-sm text-rose-400">Could not create work order.</p>}
        <ModalActions onClose={onClose} submitting={createMutation.isPending} submitLabel="Create" />
      </form>
    </Modal>
  );
}
