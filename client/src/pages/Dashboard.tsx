import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { ALL_HOTELS, useHotelScope } from "../context/HotelScopeContext";
import { useDepartmentScope } from "../context/DepartmentScopeContext";
import { DashboardSummary, InventoryItem, StockHealth, StockTransaction } from "../types";

// Status colors are reserved for stock state and never reused for anything else,
// and always appear next to a text label so color never carries meaning alone.
const STATUS = {
  critical: "#d03b3b",
  warning: "#fab219",
  good: "#0ca30c",
  info: "#58a6ff",
};

const HEALTH_SEGMENTS: { key: keyof StockHealth; label: string; color: string }[] = [
  { key: "out", label: "Out of stock", color: STATUS.critical },
  { key: "low", label: "Low", color: STATUS.warning },
  { key: "healthy", label: "Healthy", color: STATUS.good },
  { key: "over", label: "Over max", color: STATUS.info },
];

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function Dashboard() {
  const { selectedHotelId } = useHotelScope();
  const { selectedDepartmentId } = useDepartmentScope();
  const viewingAllHotels = selectedHotelId === ALL_HOTELS;
  const hotelParam = viewingAllHotels ? "" : `hotelId=${selectedHotelId}&`;
  const ready = !!selectedHotelId && !!selectedDepartmentId;

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", selectedHotelId, selectedDepartmentId],
    queryFn: () => api.get<DashboardSummary>(`/dashboard/summary?${hotelParam}departmentId=${selectedDepartmentId}`),
    enabled: ready,
  });

  const lowStockQuery = useQuery({
    queryKey: ["items", "low-stock", selectedHotelId, selectedDepartmentId],
    queryFn: () =>
      api.get<InventoryItem[]>(`/items?${hotelParam}departmentId=${selectedDepartmentId}&lowStockOnly=true`),
    enabled: ready,
  });

  const activityQuery = useQuery({
    queryKey: ["transactions", selectedHotelId, selectedDepartmentId],
    queryFn: () => api.get<StockTransaction[]>(`/transactions?${hotelParam}departmentId=${selectedDepartmentId}`),
    enabled: ready,
  });

  const summary = summaryQuery.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Stock value"
          value={summary ? numberFormat.format(summary.stockValue.total) : undefined}
          detail={
            summary &&
            (summary.itemCount === 0
              ? "No items yet"
              : summary.stockValue.itemsWithCost === summary.itemCount
              ? `All ${summary.itemCount} items costed`
              : `Cost set on ${summary.stockValue.itemsWithCost} of ${summary.itemCount} items`)
          }
        />
        <StatTile
          label="Low or out of stock"
          value={summary && String(summary.health.out + summary.health.low)}
          detail={summary && `${summary.health.out} out · ${summary.health.low} low`}
          to="/inventory"
        />
        <StatTile
          label="Open work orders"
          value={summary && String(summary.openWorkOrders.total)}
          detail={
            summary &&
            (summary.openWorkOrders.stale > 0
              ? `${summary.openWorkOrders.stale} open over ${summary.openWorkOrders.staleAfterDays} days`
              : "None overdue")
          }
          to="/work-orders"
        />
        <StatTile
          label="Pending purchase requests"
          value={summary && String(summary.pendingPurchaseRequests)}
          detail={summary && (summary.pendingPurchaseRequests > 0 ? "Awaiting approval" : "Nothing to approve")}
          to="/purchase-requests"
        />
      </div>

      <section className="card p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold text-ink-100">Stock health</h2>
          {summary && <span className="text-xs text-ink-500">{summary.itemCount} items</span>}
        </div>
        {summary && <StockHealthBar health={summary.health} total={summary.itemCount} />}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-4">
          <h2 className="font-semibold text-ink-100">Running out soonest</h2>
          <p className="text-xs text-ink-500 mb-3">
            Days of cover at the last {summary?.usageWindowDays ?? 30} days' usage rate
          </p>
          {summary?.runningOut.length === 0 && (
            <p className="text-sm text-ink-500">No items issued in this period yet.</p>
          )}
          <ul className="divide-y divide-navy-800">
            {summary?.runningOut.map((item) => (
              <li key={item.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <Link to="/inventory" className="text-ink-200 hover:text-gold-300 block truncate">
                    {item.name}
                    {viewingAllHotels && <span className="text-ink-600 font-mono"> · {item.hotelCode}</span>}
                  </Link>
                  <span className="text-xs text-ink-500 font-mono">
                    {item.quantityOnHand} {item.unit} · ~{item.dailyUsage}/day
                  </span>
                </div>
                <DaysOfCover days={item.daysOfCover} />
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold text-ink-100 mb-3">Low stock alerts</h2>
          {lowStockQuery.data?.length === 0 && <p className="text-sm text-ink-500">Nothing below reorder point.</p>}
          <ul className="divide-y divide-navy-800">
            {lowStockQuery.data?.map((item) => (
              <li key={item.id} className="py-2 flex items-center justify-between text-sm">
                <Link to="/inventory" className="text-ink-200 hover:text-gold-300">
                  {item.name}
                  {viewingAllHotels && item.hotel && (
                    <span className="text-ink-600 font-normal font-mono"> · {item.hotel.code}</span>
                  )}
                </Link>
                <span className="text-rose-400 font-medium font-mono">
                  {item.quantityOnHand} / {item.reorderPoint} {item.unit}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold text-ink-100 mb-3">Recent activity</h2>
          <ul className="divide-y divide-navy-800">
            {activityQuery.data?.slice(0, 10).map((tx) => (
              <li key={tx.id} className="py-2 text-sm flex items-center justify-between">
                <span className="text-ink-200">
                  {tx.type} · {tx.item?.name ?? tx.itemId}
                  {viewingAllHotels && tx.item?.hotel && (
                    <span className="text-ink-600 font-mono"> · {tx.item.hotel.code}</span>
                  )}
                </span>
                <span className={`font-mono ${tx.quantity < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  {tx.quantity > 0 ? "+" : ""}
                  {tx.quantity}
                </span>
              </li>
            ))}
            {activityQuery.data?.length === 0 && <p className="text-sm text-ink-500">No activity yet.</p>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatTile({ label, value, detail, to }: { label: string; value?: string; detail?: string; to?: string }) {
  const body = (
    <>
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink-100 font-mono">{value ?? "—"}</div>
      <div className="mt-1 text-xs text-ink-500">{detail ?? " "}</div>
    </>
  );
  return to ? (
    <Link to={to} className="card p-4 block transition hover:border-navy-600">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

function StockHealthBar({ health, total }: { health: StockHealth; total: number }) {
  const [hovered, setHovered] = useState<keyof StockHealth | null>(null);

  if (total === 0) return <p className="text-sm text-ink-500">No items yet.</p>;

  const segments = HEALTH_SEGMENTS.filter((s) => health[s.key] > 0);
  const percent = (n: number) => Math.round((n / total) * 100);

  return (
    <div>
      <div className="flex gap-[2px]" role="img" aria-label={HEALTH_SEGMENTS.map((s) => `${s.label}: ${health[s.key]}`).join(", ")}>
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
                {s.label}: <span className="font-mono text-ink-100">{health[s.key]}</span> ({percent(health[s.key])}%)
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
            <span className="text-ink-300">{s.label}</span>
            <span className="font-mono text-ink-100">{health[s.key]}</span>
            <span className="text-ink-500 text-xs">{percent(health[s.key])}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DaysOfCover({ days }: { days: number }) {
  const color = days <= 3 ? STATUS.critical : days <= 7 ? STATUS.warning : null;
  const text = days === 0 ? "Out" : days > 365 ? "1y+" : `${days} ${days === 1 ? "day" : "days"}`;
  return (
    <span className="flex items-center gap-1.5 shrink-0 text-sm font-mono text-ink-100">
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />}
      {text}
    </span>
  );
}
