import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ALL_HOTELS, useHotelScope } from "../context/HotelScopeContext";
import { useDepartmentScope } from "../context/DepartmentScopeContext";
import { InventoryItem, MyWork, MyWorkOrder, WorkOrderStatus } from "../types";

// Same reserved stock-status colors as the main dashboard, always next to a text label.
const STOCK_STATUS: Record<MyWork["topItems"][number]["status"], { label: string; color: string | null }> = {
  out: { label: "Out", color: "#d03b3b" },
  low: { label: "Low", color: "#fab219" },
  healthy: { label: "OK", color: null },
  over: { label: "Over max", color: null },
};

const NEXT_STEP: Record<WorkOrderStatus, { status: WorkOrderStatus; label: string } | null> = {
  OPEN: { status: "IN_PROGRESS", label: "Start" },
  IN_PROGRESS: { status: "COMPLETED", label: "Complete" },
  COMPLETED: null,
};

const TYPE_LABEL = { RECEIVE: "Received", ISSUE: "Issued", ADJUSTMENT: "Adjusted" } as const;

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** What a Staff member sees first: their own jobs and the stock they handle. */
export function StaffDashboard() {
  const { user } = useAuth();
  const { selectedHotelId } = useHotelScope();
  const { selectedDepartmentId } = useDepartmentScope();
  const queryClient = useQueryClient();
  const ready = !!selectedHotelId && !!selectedDepartmentId;
  const hotelParam = selectedHotelId === ALL_HOTELS ? "" : `hotelId=${selectedHotelId}&`;

  const myWorkQuery = useQuery({
    queryKey: ["my-work", selectedHotelId, selectedDepartmentId],
    queryFn: () => api.get<MyWork>(`/dashboard/my-work?${hotelParam}departmentId=${selectedDepartmentId}`),
    enabled: ready,
  });

  const lowStockQuery = useQuery({
    queryKey: ["items", "low-stock", selectedHotelId, selectedDepartmentId],
    queryFn: () =>
      api.get<InventoryItem[]>(`/items?${hotelParam}departmentId=${selectedDepartmentId}&lowStockOnly=true`),
    enabled: ready,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...change }: { id: string; status?: WorkOrderStatus; assignedToUserId?: string }) =>
      api.patch(`/work-orders/${id}`, change),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-work"] });
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    },
  });

  const work = myWorkQuery.data;
  const inProgress = work?.assigned.filter((wo) => wo.status === "IN_PROGRESS").length ?? 0;
  const lowCount = lowStockQuery.data?.length;
  const busyId = updateMutation.isPending ? updateMutation.variables?.id : null;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-ink-100">Hi {user?.name.split(" ")[0]}</h1>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <Tile
          label="My open work orders"
          value={work?.assigned.length}
          detail={work && (work.assigned.length === 0 ? "Nothing assigned" : `${inProgress} in progress`)}
          href="#my-work"
        />
        <Tile
          label="Completed this week"
          value={work?.completedThisWeek}
          detail={work && "Last 7 days"}
        />
        <Tile
          label="Low or out of stock"
          value={lowCount}
          detail={lowCount === undefined ? undefined : lowCount === 0 ? "All stocked" : "Needs restocking"}
          to="/inventory"
        />
      </div>

      {updateMutation.isError && (
        <p className="text-sm text-rose-400">
          {updateMutation.error instanceof Error && updateMutation.error.message
            ? updateMutation.error.message
            : "Could not update the work order."}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="my-work" title="My work orders" subtitle="Assigned to you, oldest first">
          {work?.assigned.length === 0 && <Empty>Nothing assigned to you right now.</Empty>}
          <ul className="divide-y divide-navy-800">
            {work?.assigned.map((wo) => {
              const next = NEXT_STEP[wo.status];
              return (
                <WorkOrderRow
                  key={wo.id}
                  workOrder={wo}
                  action={
                    next && (
                      <button
                        onClick={() => updateMutation.mutate({ id: wo.id, status: next.status })}
                        disabled={busyId === wo.id}
                        className={next.status === "COMPLETED" ? "btn-primary text-xs px-2.5 py-1.5" : "btn-ghost text-xs px-2.5 py-1.5"}
                      >
                        {busyId === wo.id ? "Saving..." : next.label}
                      </button>
                    )
                  }
                />
              );
            })}
          </ul>
        </Section>

        <Section title="Up for grabs" subtitle="Open work orders nobody has taken yet">
          {work?.upForGrabs.length === 0 && <Empty>Every open work order has someone on it.</Empty>}
          <ul className="divide-y divide-navy-800">
            {work?.upForGrabs.map((wo) => (
              <WorkOrderRow
                key={wo.id}
                workOrder={wo}
                action={
                  user && (
                    <button
                      onClick={() => updateMutation.mutate({ id: wo.id, assignedToUserId: user.id })}
                      disabled={busyId === wo.id}
                      className="btn-ghost text-xs px-2.5 py-1.5"
                    >
                      {busyId === wo.id ? "Saving..." : "Take it"}
                    </button>
                  )
                }
              />
            ))}
          </ul>
        </Section>

        <Section title="Items I use most" subtitle="What you issued in the last 30 days, and what's left">
          {work?.topItems.length === 0 && <Empty>You haven't issued anything in the last 30 days.</Empty>}
          <ul className="divide-y divide-navy-800">
            {work?.topItems.map((item) => {
              const status = STOCK_STATUS[item.status];
              return (
                <li key={item.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <Link to="/inventory" className="text-ink-200 hover:text-gold-300 block truncate">
                      {item.name}
                    </Link>
                    <span className="text-xs text-ink-500">
                      You issued {item.issuedLast30Days} {item.unit}
                    </span>
                  </div>
                  <span className="flex items-center gap-1.5 shrink-0 font-mono text-ink-100">
                    {status.color && (
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} aria-hidden="true" />
                    )}
                    {item.quantityOnHand} {item.unit}
                    <span className="text-xs text-ink-500 font-sans">{status.label}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="My recent activity" subtitle="Your latest stock movements">
          {work?.recent.length === 0 && <Empty>No stock movements by you yet.</Empty>}
          <ul className="divide-y divide-navy-800">
            {work?.recent.map((tx) => (
              <li key={tx.id} className="py-2 text-sm flex items-center justify-between gap-3">
                <span className="text-ink-200 min-w-0 truncate">
                  {TYPE_LABEL[tx.type]} · {tx.item.name}
                  <span className="text-xs text-ink-500"> · {shortDate.format(new Date(tx.createdAt))}</span>
                </span>
                <span className={`font-mono shrink-0 ${tx.quantity < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  {tx.quantity > 0 ? "+" : ""}
                  {tx.quantity} {tx.item.unit}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Low stock alerts" subtitle="Below reorder point — tell your manager if something's missing">
        {lowStockQuery.data?.length === 0 && <Empty>Nothing below reorder point.</Empty>}
        <ul className="divide-y divide-navy-800">
          {lowStockQuery.data?.map((item) => (
            <li key={item.id} className="py-2 flex items-center justify-between text-sm">
              <Link to="/inventory" className="text-ink-200 hover:text-gold-300">
                {item.name}
              </Link>
              <span className="text-rose-400 font-medium font-mono">
                {item.quantityOnHand} / {item.reorderPoint} {item.unit}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function WorkOrderRow({ workOrder: wo, action }: { workOrder: MyWorkOrder; action: ReactNode }) {
  return (
    <li className="py-2.5 flex items-start justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="text-ink-100">
          {wo.title}
          {wo.status === "IN_PROGRESS" && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300">In progress</span>
          )}
        </p>
        {wo.description && <p className="text-xs text-ink-300 truncate">{wo.description}</p>}
        <p className="text-xs text-ink-500">
          From {wo.createdBy.name} · {shortDate.format(new Date(wo.createdAt))}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

function Tile({
  label,
  value,
  detail,
  href,
  to,
}: {
  label: string;
  value?: number;
  detail?: string | false;
  href?: string;
  to?: string;
}) {
  const body = (
    <>
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink-100 font-mono">{value ?? "—"}</div>
      <div className="mt-1 text-xs text-ink-500">{detail || " "}</div>
    </>
  );
  const className = "card p-4 block transition hover:border-navy-600";
  if (to) return <Link to={to} className={className}>{body}</Link>;
  if (href) return <a href={href} className={className}>{body}</a>;
  return <div className="card p-4">{body}</div>;
}

function Section({ id, title, subtitle, children }: { id?: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section id={id} className="card p-4 scroll-mt-20">
      <h2 className="font-semibold text-ink-100">{title}</h2>
      <p className="text-xs text-ink-500 mb-3">{subtitle}</p>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-500">{children}</p>;
}
