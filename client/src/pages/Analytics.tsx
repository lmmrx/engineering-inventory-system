import { ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { ALL_HOTELS, useHotelScope } from "../context/HotelScopeContext";
import { useDepartmentScope } from "../context/DepartmentScopeContext";
import { Spinner } from "../components/Spinner";
import { Analytics as AnalyticsData, IdleStock, ItemForecast, ReorderPointAdvice, UsageAnomaly } from "../types";

// Same reserved status colors as the dashboard; always paired with a text label.
const STATUS = { critical: "#d03b3b", warning: "#fab219" };
// The sparkline is a single neutral series, so it never borrows a status color.
const SERIES = "#c9d1d9";

const RUN_OUT_SOON_DAYS = 14;
const COLLAPSED_ROWS = 10;

const qty = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const dateTime = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function Analytics() {
  const { selectedHotelId } = useHotelScope();
  const { selectedDepartmentId } = useDepartmentScope();
  const viewingAllHotels = selectedHotelId === ALL_HOTELS;
  const ready = !!selectedHotelId && !!selectedDepartmentId;

  const query = useQuery({
    queryKey: ["analytics", selectedHotelId, selectedDepartmentId],
    queryFn: () => {
      const params = new URLSearchParams({
        departmentId: selectedDepartmentId,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!viewingAllHotels) params.set("hotelId", selectedHotelId);
      return api.get<AnalyticsData>(`/analytics?${params}`);
    },
    enabled: ready,
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-500 py-10 justify-center">
        <Spinner /> Analyzing stock history...
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <p className="text-sm text-rose-400 py-10 text-center">
        {query.error instanceof Error && query.error.message ? query.error.message : "Could not load analytics."}
      </p>
    );
  }

  const data = query.data;
  const runningOutSoon = data.forecasts.filter((f) => f.daysLeft !== null && f.daysLeft <= RUN_OUT_SOON_DAYS).length;
  const reorderTooLow = data.reorderPoints.filter((r) => r.status === "too_low").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-100">Analytics</h1>
        <p className="text-sm text-ink-500">
          Predictions learned from the last {Math.round(data.historyDays / 7)} weeks of stock movements. They improve as
          more history builds up.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Tile
          label={`Run out within ${RUN_OUT_SOON_DAYS} days`}
          value={runningOutSoon}
          detail="At the forecast usage rate"
          href="#forecast"
        />
        <Tile
          label="Reorder points to review"
          value={data.reorderPoints.length}
          detail={`${reorderTooLow} too low · ${data.reorderPoints.length - reorderTooLow} too high`}
          href="#reorder"
        />
        <Tile
          label="Unusual activity"
          value={data.anomalies.length}
          detail={`Last ${data.settings.anomalyWindowDays} days`}
          href="#unusual"
        />
        <Tile
          label="Idle stock value"
          value={money.format(data.deadStockValue)}
          detail={`${data.deadStock.length} dead or slow-moving items`}
          href="#idle"
        />
      </div>

      <ForecastSection data={data} showHotel={viewingAllHotels} />
      <ReorderSection data={data} showHotel={viewingAllHotels} />
      <AnomalySection data={data} showHotel={viewingAllHotels} />
      <IdleSection data={data} showHotel={viewingAllHotels} />
    </div>
  );
}

function Tile({ label, value, detail, href }: { label: string; value: ReactNode; detail: string; href: string }) {
  return (
    <a href={href} className="card p-4 block hover:border-navy-700 transition">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="text-2xl font-semibold text-ink-100 mt-1 tabular-nums">{value}</p>
      <p className="text-xs text-ink-500 mt-1">{detail}</p>
    </a>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card p-4 scroll-mt-20">
      <h2 className="font-semibold text-ink-100">{title}</h2>
      <p className="text-xs text-ink-500 mb-3">{description}</p>
      {children}
    </section>
  );
}

/** Shows the first rows, with a button to reveal the rest. */
function useCollapsed<T>(rows: T[]) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
  const toggle =
    rows.length > COLLAPSED_ROWS ? (
      <button onClick={() => setExpanded(!expanded)} className="mt-3 text-xs text-gold-400 hover:text-gold-300">
        {expanded ? "Show fewer" : `Show all ${rows.length}`}
      </button>
    ) : null;
  return { visible, toggle };
}

function ItemName({ name, hotelCode, showHotel }: { name: string; hotelCode: string; showHotel: boolean }) {
  return (
    <span className="text-ink-200">
      {name}
      {showHotel && <span className="text-ink-600 font-mono"> · {hotelCode}</span>}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-500">{children}</p>;
}

const th = "px-3 py-2 font-medium whitespace-nowrap";
const td = "px-3 py-2 align-middle";

// ---------------------------------------------------------------- Forecast

function ForecastSection({ data, showHotel }: { data: AnalyticsData; showHotel: boolean }) {
  const { visible, toggle } = useCollapsed(data.forecasts);
  return (
    <Section
      id="forecast"
      title="Demand forecast"
      description={`Expected usage over the next ${data.forecastDays / 7} weeks, learning each item's weekly pattern and trend. Soonest to run out first.`}
    >
      {data.forecasts.length === 0 ? (
        <Empty>No items have been issued yet — forecasts appear once stock starts moving.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head-row">
                  <th className={th}>Item</th>
                  <th className={`${th} text-right`}>On hand</th>
                  <th className={`${th} text-right`}>Next 7 days</th>
                  <th className={`${th} text-right`}>Next 4 weeks</th>
                  <th className={th}>Trend</th>
                  <th className={th}>Runs out</th>
                  <th className={th}>Weekly use</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800">
                {visible.map((f) => (
                  <tr key={f.id}>
                    <td className={td}>
                      <ItemName name={f.name} hotelCode={f.hotelCode} showHotel={showHotel} />
                      {f.confidence === "low" && <p className="text-xs text-ink-500">Limited history — rough estimate</p>}
                    </td>
                    <td className={`${td} text-right tabular-nums text-ink-300 whitespace-nowrap`}>
                      {f.onHand} {f.unit}
                    </td>
                    <td className={`${td} text-right tabular-nums text-ink-300`}>{qty.format(f.next7)}</td>
                    <td className={`${td} text-right tabular-nums text-ink-300`}>{qty.format(f.next28)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <Trend change={f.change} />
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <RunsOut forecast={f} />
                    </td>
                    <td className={td}>
                      <Sparkline forecast={f} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {toggle}
        </>
      )}
    </Section>
  );
}

function Trend({ change }: { change: number | null }) {
  if (change === null) return <span className="text-xs text-ink-500">Not enough history</span>;
  if (Math.abs(change) < 15) return <span className="text-xs text-ink-300">→ Steady</span>;
  return (
    <span className="text-xs text-ink-300">
      {change > 0 ? "↑ Up" : "↓ Down"} {Math.abs(change)}%
    </span>
  );
}

function RunsOut({ forecast }: { forecast: ItemForecast }) {
  const { daysLeft, runOutDate } = forecast;
  if (daysLeft === null || !runOutDate) return <span className="text-xs text-ink-500">Over a year</span>;
  const color = daysLeft <= 3 ? STATUS.critical : daysLeft <= RUN_OUT_SOON_DAYS ? STATUS.warning : null;
  return (
    <span className="flex items-center gap-1.5 text-ink-100">
      {color && <span className="h-2 w-2 rounded-full flex-none" style={{ backgroundColor: color }} aria-hidden="true" />}
      <span>
        {daysLeft === 0 ? "Today" : shortDate.format(new Date(runOutDate))}
        <span className="text-xs text-ink-500"> · {daysLeft === 0 ? "now" : `${daysLeft}d`}</span>
      </span>
    </span>
  );
}

/**
 * Weekly usage: past weeks as a solid line, the forecast dashed. One neutral
 * series, so the item name is its label; hover a week for its number.
 */
function Sparkline({ forecast }: { forecast: ItemForecast }) {
  const history = forecast.weeklyHistory.slice(-Math.max(1, forecast.historyWeeks));
  const values = [...history, ...forecast.weeklyForecast];
  const width = 132;
  const height = 32;
  const pad = 3;
  const max = Math.max(1, ...values);
  const step = (width - pad * 2) / Math.max(1, values.length - 1);
  const x = (i: number) => pad + i * step;
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const line = (from: number, to: number) =>
    values
      .slice(from, to + 1)
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(from + i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
  const split = history.length - 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Weekly use: last ${history.length} weeks ${history.map((v) => qty.format(v)).join(", ")}; forecast ${forecast.weeklyForecast.map((v) => qty.format(v)).join(", ")}`}
      className="block"
    >
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="#30363d" strokeWidth={1} />
      <path d={line(0, split)} fill="none" stroke={SERIES} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={line(split, values.length - 1)}
        fill="none"
        stroke={SERIES}
        strokeWidth={2}
        strokeDasharray="3 3"
        strokeOpacity={0.6}
        strokeLinecap="round"
      />
      {values.map((v, i) => (
        // Invisible hit areas, wider than the line, carry each week's number.
        <rect key={i} x={x(i) - step / 2} y={0} width={step} height={height} fill="transparent">
          <title>
            {i <= split
              ? `${history.length - 1 - i === 0 ? "Last week" : `${history.length - 1 - i + 1} weeks ago`}: ${qty.format(v)} ${forecast.unit}`
              : `Forecast, week ${i - split}: ${qty.format(v)} ${forecast.unit}`}
          </title>
        </rect>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- Reorder points

function ReorderSection({ data, showHotel }: { data: AnalyticsData; showHotel: boolean }) {
  const { visible, toggle } = useCollapsed(data.reorderPoints);
  const lead = data.leadTime;
  return (
    <Section
      id="reorder"
      title="Smart reorder points"
      description={
        <>
          Suggested from each item's usage, how much it varies, and how long deliveries take — enough to cover about 19 in 20
          delivery waits.{" "}
          {lead.measured
            ? `Purchase requests here take about ${qty.format(lead.days)} days from request to delivery (from ${lead.samples} received).`
            : `Delivery time is assumed to be ${lead.days} days until at least 3 purchase requests have been received.`}
        </>
      }
    >
      {data.reorderPoints.length === 0 ? (
        <Empty>All reorder points with enough history look right for current usage.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head-row">
                  <th className={th}>Item</th>
                  <th className={`${th} text-right`}>Current</th>
                  <th className={`${th} text-right`}>Suggested</th>
                  <th className={th}>Verdict</th>
                  <th className={`${th} text-right`}>Daily use</th>
                  <th className={`${th} text-right`}>Delivery time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800">
                {visible.map((r) => (
                  <ReorderRow key={r.id} advice={r} showHotel={showHotel} />
                ))}
              </tbody>
            </table>
          </div>
          {toggle}
        </>
      )}
    </Section>
  );
}

function ReorderRow({ advice: r, showHotel }: { advice: ReorderPointAdvice; showHotel: boolean }) {
  return (
    <tr>
      <td className={td}>
        <ItemName name={r.name} hotelCode={r.hotelCode} showHotel={showHotel} />
      </td>
      <td className={`${td} text-right tabular-nums text-ink-300`}>{r.current}</td>
      <td className={`${td} text-right tabular-nums text-ink-100 font-medium`}>{r.suggested}</td>
      <td className={`${td} whitespace-nowrap`}>
        {r.status === "too_low" ? (
          <span className="flex items-center gap-1.5 text-ink-100">
            <span className="h-2 w-2 rounded-full flex-none" style={{ backgroundColor: STATUS.warning }} aria-hidden="true" />
            Too low — risk of running out
          </span>
        ) : (
          <span className="text-ink-300">Too high — more stock than needed</span>
        )}
      </td>
      <td className={`${td} text-right tabular-nums text-ink-300 whitespace-nowrap`}>
        {qty.format(r.dailyRate)} {r.unit}
      </td>
      <td className={`${td} text-right text-ink-300 whitespace-nowrap`}>
        {qty.format(r.leadTimeDays)}d
        <span className="text-xs text-ink-500">
          {" "}
          {!r.leadTimeMeasured ? "assumed" : r.leadTimeBasis === "item" ? "this item" : "average"}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- Unusual activity

function AnomalySection({ data, showHotel }: { data: AnalyticsData; showHotel: boolean }) {
  const { visible, toggle } = useCollapsed(data.anomalies);
  return (
    <Section
      id="unusual"
      title="Unusual activity"
      description={`Issues far bigger than an item's normal amount, and write-downs worth more than a week of use, in the last ${data.settings.anomalyWindowDays} days. Often a typo or a one-off job — worth a quick check.`}
    >
      {data.anomalies.length === 0 ? (
        <Empty>Nothing out of the ordinary.</Empty>
      ) : (
        <>
          <ul className="divide-y divide-navy-800">
            {visible.map((a) => (
              <AnomalyRow key={a.transactionId} anomaly={a} showHotel={showHotel} />
            ))}
          </ul>
          {toggle}
        </>
      )}
    </Section>
  );
}

function AnomalyRow({ anomaly: a, showHotel }: { anomaly: UsageAnomaly; showHotel: boolean }) {
  return (
    <li className="py-2 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 text-sm">
      <div className="min-w-0">
        <ItemName name={a.itemName} hotelCode={a.hotelCode} showHotel={showHotel} />
        <p className="text-xs text-ink-300">{a.reason}</p>
        {a.notes && <p className="text-xs text-ink-500 truncate">Note: {a.notes}</p>}
      </div>
      <p className="text-xs text-ink-500 whitespace-nowrap">
        {a.performedBy} · {dateTime.format(new Date(a.date))}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------- Dead & slow stock

function IdleSection({ data, showHotel }: { data: AnalyticsData; showHotel: boolean }) {
  const { visible, toggle } = useCollapsed(data.deadStock);
  return (
    <Section
      id="idle"
      title="Dead and slow-moving stock"
      description={`Items on the shelf with no use in ${data.settings.deadAfterDays}+ days (dead), or enough to last over ${Math.round(
        data.settings.slowCoverDays / 30
      )} months at the current rate (slow). Highest value first.`}
    >
      {data.deadStock.length === 0 ? (
        <Empty>No idle stock — everything on the shelf is moving.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head-row">
                  <th className={th}>Item</th>
                  <th className={th}>Status</th>
                  <th className={`${th} text-right`}>On hand</th>
                  <th className={`${th} text-right`}>Value</th>
                  <th className={th}>Last used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800">
                {visible.map((d) => (
                  <IdleRow key={d.id} item={d} showHotel={showHotel} />
                ))}
              </tbody>
            </table>
          </div>
          {toggle}
        </>
      )}
    </Section>
  );
}

function IdleRow({ item: d, showHotel }: { item: IdleStock; showHotel: boolean }) {
  return (
    <tr>
      <td className={td}>
        <ItemName name={d.name} hotelCode={d.hotelCode} showHotel={showHotel} />
      </td>
      <td className={`${td} text-ink-300 whitespace-nowrap`}>
        {d.kind === "dead" ? "Dead" : `Slow · ~${Math.round((d.daysOfCover ?? 0) / 30)} months of stock`}
      </td>
      <td className={`${td} text-right tabular-nums text-ink-300 whitespace-nowrap`}>
        {d.onHand} {d.unit}
      </td>
      <td className={`${td} text-right tabular-nums text-ink-300`}>{d.value === null ? "—" : money.format(d.value)}</td>
      <td className={`${td} text-ink-300 whitespace-nowrap`}>
        {d.lastUsedAt ? `${shortDate.format(new Date(d.lastUsedAt))} · ${d.idleDays}d ago` : "Never"}
      </td>
    </tr>
  );
}
