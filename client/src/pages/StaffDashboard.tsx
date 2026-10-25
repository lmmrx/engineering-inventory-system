import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useScope } from "../hooks/useScope";
import { LowStockList, useLowStock } from "../components/LowStockList";
import { EmptyState, STATUS_COLORS, Section, StatTile, StatusDot } from "../components/ui";
import { MyWork, MyWorkOrder, WorkOrderStatus } from "../types";
import { MessageKey, useLocale, useT } from "../i18n";

const STOCK_STATUS: Record<MyWork["topItems"][number]["status"], { label: MessageKey; color: string | null }> = {
  out: { label: "stock.out", color: STATUS_COLORS.critical },
  low: { label: "stock.low", color: STATUS_COLORS.warning },
  healthy: { label: "stock.ok", color: null },
  over: { label: "stock.over", color: null },
};

const NEXT_STEP: Record<WorkOrderStatus, { status: WorkOrderStatus; label: MessageKey } | null> = {
  OPEN: { status: "IN_PROGRESS", label: "staff.start" },
  IN_PROGRESS: { status: "COMPLETED", label: "staff.complete" },
  COMPLETED: null,
};

function useShortDate() {
  return new Intl.DateTimeFormat(useLocale(), { month: "short", day: "numeric" });
}

/** What a Staff member sees first: their own jobs and the stock they handle. */
export function StaffDashboard() {
  const { user } = useAuth();
  const t = useT();
  const shortDate = useShortDate();
  const { selectedHotelId, selectedDepartmentId, ready, params } = useScope();
  const queryClient = useQueryClient();

  const myWorkQuery = useQuery({
    queryKey: ["my-work", selectedHotelId, selectedDepartmentId],
    queryFn: () => api.get<MyWork>(`/dashboard/my-work?${params()}`),
    enabled: ready,
  });

  const lowStockQuery = useLowStock();

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
      <h1 className="text-lg font-semibold text-ink-100">{t("staff.hi", { name: user?.name.split(" ")[0] ?? "" })}</h1>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatTile
          label={t("staff.myOpen")}
          value={work?.assigned.length}
          detail={work && (work.assigned.length === 0 ? t("staff.nothingAssigned") : t("staff.inProgressCount", { count: inProgress }))}
          href="#my-work"
        />
        <StatTile
          label={t("staff.completedWeek")}
          value={work?.completedThisWeek}
          detail={work && t("staff.last7")}
        />
        <StatTile
          label={t("dash.lowOrOut")}
          value={lowCount}
          detail={lowCount === undefined ? undefined : lowCount === 0 ? t("staff.allStocked") : t("staff.needsRestock")}
          to="/inventory"
        />
      </div>

      {updateMutation.isError && (
        <p className="text-sm text-rose-400">
          {updateMutation.error instanceof Error && updateMutation.error.message
            ? updateMutation.error.message
            : t("staff.updateFailed")}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="my-work" title={t("staff.myWork")} subtitle={t("staff.myWorkHint")}>
          {work?.assigned.length === 0 && <EmptyState>{t("staff.nothingNow")}</EmptyState>}
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
                        {busyId === wo.id ? t("common.saving") : t(next.label)}
                      </button>
                    )
                  }
                />
              );
            })}
          </ul>
        </Section>

        <Section title={t("staff.upForGrabs")} subtitle={t("staff.upForGrabsHint")}>
          {work?.upForGrabs.length === 0 && <EmptyState>{t("staff.allTaken")}</EmptyState>}
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
                      {busyId === wo.id ? t("common.saving") : t("staff.take")}
                    </button>
                  )
                }
              />
            ))}
          </ul>
        </Section>

        <Section title={t("staff.topItems")} subtitle={t("staff.topItemsHint")}>
          {work?.topItems.length === 0 && <EmptyState>{t("staff.noneIssued")}</EmptyState>}
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
                      {t("staff.youIssued", { quantity: item.issuedLast30Days, unit: item.unit })}
                    </span>
                  </div>
                  <span className="flex items-center gap-1.5 shrink-0 font-mono text-ink-100">
                    {status.color && <StatusDot color={status.color} />}
                    {item.quantityOnHand} {item.unit}
                    <span className="text-xs text-ink-500 font-sans">{t(status.label)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title={t("staff.recent")} subtitle={t("staff.recentHint")}>
          {work?.recent.length === 0 && <EmptyState>{t("staff.noMovements")}</EmptyState>}
          <ul className="divide-y divide-navy-800">
            {work?.recent.map((tx) => (
              <li key={tx.id} className="py-2 text-sm flex items-center justify-between gap-3">
                <span className="text-ink-200 min-w-0 truncate">
                  {t(`tx.${tx.type}`)} · {tx.item.name}
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

      <Section title={t("dash.lowAlerts")} subtitle={t("staff.lowHint")}>
        <LowStockList />
      </Section>
    </div>
  );
}

function WorkOrderRow({ workOrder: wo, action }: { workOrder: MyWorkOrder; action: ReactNode }) {
  const t = useT();
  const shortDate = useShortDate();
  return (
    <li className="py-2.5 flex items-start justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="text-ink-100">
          {wo.title}
          {wo.status === "IN_PROGRESS" && (
            <span className="ms-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300">{t("staff.inProgress")}</span>
          )}
        </p>
        {wo.description && <p className="text-xs text-ink-300 truncate">{wo.description}</p>}
        <p className="text-xs text-ink-500">
          {t("staff.from", { name: wo.createdBy.name, date: shortDate.format(new Date(wo.createdAt)) })}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}
