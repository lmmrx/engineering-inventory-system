import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { StaffDashboard } from "./StaffDashboard";
import { MessageKey, useLocale, useT } from "../i18n";
import { timeZone, useScope } from "../hooks/useScope";
import { LowStockList } from "../components/LowStockList";
import { EmptyState, STATUS_COLORS, Section, StatTile, StatusDot } from "../components/ui";
import { DashboardSummary, StockHealth, StockTransaction } from "../types";

const HEALTH_SEGMENTS: { key: keyof StockHealth; label: MessageKey; color: string }[] = [
  { key: "out", label: "health.out", color: STATUS_COLORS.critical },
  { key: "low", label: "health.low", color: STATUS_COLORS.warning },
  { key: "healthy", label: "health.healthy", color: STATUS_COLORS.good },
  { key: "over", label: "health.over", color: STATUS_COLORS.info },
];

// The dashboard shows the latest few movements; the full history is in Reports.
const RECENT_ACTIVITY = 10;

/** Staff see their own work first; everyone above them sees the whole operation. */
export function Dashboard() {
  const { user } = useAuth();
  return user?.role === "STAFF" ? <StaffDashboard /> : <TeamDashboard />;
}

function TeamDashboard() {
  const t = useT();
  const numberFormat = new Intl.NumberFormat(useLocale(), { maximumFractionDigits: 0 });
  const { selectedHotelId, selectedDepartmentId, viewingAllHotels, ready, params } = useScope();

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", selectedHotelId, selectedDepartmentId],
    queryFn: () => api.get<DashboardSummary>(`/dashboard/summary?${params({ tz: timeZone() })}`),
    enabled: ready,
  });

  const activityQuery = useQuery({
    queryKey: ["transactions", selectedHotelId, selectedDepartmentId, "recent"],
    queryFn: () => api.get<StockTransaction[]>(`/transactions?${params({ limit: String(RECENT_ACTIVITY) })}`),
    enabled: ready,
  });

  const summary = summaryQuery.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t("dash.stockValue")}
          value={summary && numberFormat.format(summary.stockValue.total)}
          detail={
            summary &&
            (summary.itemCount === 0
              ? t("dash.noItemsYet")
              : summary.stockValue.itemsWithCost === summary.itemCount
              ? t("dash.allCosted", { count: summary.itemCount })
              : t("dash.someCosted", { costed: summary.stockValue.itemsWithCost, count: summary.itemCount }))
          }
        />
        <StatTile
          label={t("dash.lowOrOut")}
          value={summary && summary.health.out + summary.health.low}
          detail={summary && t("dash.outLow", { out: summary.health.out, low: summary.health.low })}
          to="/inventory"
        />
        <StatTile
          label={t("dash.openWorkOrders")}
          value={summary?.openWorkOrders.total}
          detail={
            summary &&
            (summary.openWorkOrders.stale > 0
              ? t("dash.overdue", { count: summary.openWorkOrders.stale, days: summary.openWorkOrders.staleAfterDays })
              : t("dash.noneOverdue"))
          }
          to="/work-orders"
        />
        <StatTile
          label={t("dash.pendingRequests")}
          value={summary?.pendingPurchaseRequests}
          detail={summary && (summary.pendingPurchaseRequests > 0 ? t("dash.awaitingApproval") : t("dash.nothingToApprove"))}
          to="/purchase-requests"
        />
      </div>

      <Section
        title={t("dash.stockHealth")}
        aside={summary && <span className="text-xs text-ink-500">{t("dash.itemCount", { count: summary.itemCount })}</span>}
      >
        {summary && <StockHealthBar health={summary.health} total={summary.itemCount} />}
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title={t("dash.runningOut")} subtitle={t("dash.runningOutHint")}>
          {summary?.runningOut.length === 0 && <EmptyState>{t("dash.noneIssued")}</EmptyState>}
          <ul className="divide-y divide-navy-800">
            {summary?.runningOut.map((item) => (
              <li key={item.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <Link to="/inventory" className="text-ink-200 hover:text-gold-300 block truncate">
                    {item.name}
                    {viewingAllHotels && <span className="text-ink-600 font-mono"> · {item.hotelCode}</span>}
                  </Link>
                  <span className="text-xs text-ink-500 font-mono">
                    {item.quantityOnHand} {item.unit} · {t("dash.perDay", { rate: item.dailyUsage })}
                  </span>
                </div>
                <DaysOfCover days={item.daysOfCover} />
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("dash.lowAlerts")}>
          <LowStockList />
        </Section>

        <Section title={t("dash.recentActivity")}>
          {activityQuery.data?.length === 0 && <EmptyState>{t("dash.noActivity")}</EmptyState>}
          <ul className="divide-y divide-navy-800">
            {activityQuery.data?.map((tx) => (
              <li key={tx.id} className="py-2 text-sm flex items-center justify-between gap-3">
                <span className="text-ink-200 min-w-0 truncate">
                  {t(`tx.${tx.type}`)} · {tx.item?.name ?? tx.itemId}
                  {viewingAllHotels && tx.item?.hotel && <span className="text-ink-600 font-mono"> · {tx.item.hotel.code}</span>}
                </span>
                <span className={`font-mono shrink-0 ${tx.quantity < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  {tx.quantity > 0 ? "+" : ""}
                  {tx.quantity}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function StockHealthBar({ health, total }: { health: StockHealth; total: number }) {
  const t = useT();
  const [hovered, setHovered] = useState<keyof StockHealth | null>(null);

  if (total === 0) return <p className="text-sm text-ink-500">{t("dash.noItemsYet")}</p>;

  const segments = HEALTH_SEGMENTS.filter((s) => health[s.key] > 0);
  const percent = (n: number) => Math.round((n / total) * 100);

  return (
    <div>
      <div className="flex gap-[2px]" role="img" aria-label={HEALTH_SEGMENTS.map((s) => `${t(s.label)}: ${health[s.key]}`).join(", ")}>
        {segments.map((s, i) => (
          // The hover target is taller than the visible bar so thin segments stay easy to hit.
          <div
            key={s.key}
            className="relative h-7 flex items-center min-w-[6px]"
            style={{ flexGrow: health[s.key], flexBasis: 0 }}
            onMouseEnter={() => setHovered(s.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <div
              className={`h-3 w-full transition-opacity ${i === 0 ? "rounded-l" : ""} ${
                i === segments.length - 1 ? "rounded-r" : ""
              } ${hovered && hovered !== s.key ? "opacity-40" : ""}`}
              style={{ backgroundColor: s.color }}
            />
            {hovered === s.key && (
              // Edge segments anchor the tooltip to their outer edge so it can't spill past the card.
              <div
                className={`absolute bottom-full mb-1 z-10 ${
                  i === 0 ? "left-0" : i === segments.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"
                } whitespace-nowrap rounded-md border border-navy-700 bg-navy-850 px-2 py-1 text-xs text-ink-200 shadow-lg pointer-events-none`}
              >
                {t(s.label)}: <span className="font-mono text-ink-100">{health[s.key]}</span> ({percent(health[s.key])}%)
              </div>
            )}
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {HEALTH_SEGMENTS.map((s) => (
          <li
            key={s.key}
            className={`flex items-center gap-2 transition-opacity ${hovered && hovered !== s.key ? "opacity-50" : ""}`}
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
            <span className="text-ink-300">{t(s.label)}</span>
            <span className="font-mono text-ink-100">{health[s.key]}</span>
            <span className="text-ink-500 text-xs">{percent(health[s.key])}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DaysOfCover({ days }: { days: number | null }) {
  const t = useT();
  const color = days === null ? null : days <= 3 ? STATUS_COLORS.critical : days <= 7 ? STATUS_COLORS.warning : null;
  const text =
    days === null ? t("cover.overYear") : days === 0 ? t("cover.out") : days === 1 ? t("cover.day") : t("cover.days", { count: days });
  return (
    <span className="flex items-center gap-1.5 shrink-0 text-sm font-mono text-ink-100">
      {color && <StatusDot color={color} />}
      {text}
    </span>
  );
}
