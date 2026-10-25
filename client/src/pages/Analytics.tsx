import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { timeZone, useScope } from "../hooks/useScope";
import { EmptyState, STATUS_COLORS, Section, StatTile, StatusDot } from "../components/ui";
import { Spinner } from "../components/Spinner";
import { useLocale, useT } from "../i18n";
import { Analytics as AnalyticsData, IdleStock, ItemForecast, ReorderPointAdvice, UsageAnomaly } from "../types";

const RUN_OUT_SOON_DAYS = 14;
const COLLAPSED_ROWS = 10;

/** Number and date formats for the reader's language. */
function useFormats() {
  const locale = useLocale();
  return useMemo(
    () => ({
      qty: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
      money: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      shortDate: new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
      dateTime: new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    }),
    [locale]
  );
}

export function Analytics() {
  const t = useT();
  const { money } = useFormats();
  const { selectedHotelId, selectedDepartmentId, viewingAllHotels, ready, params } = useScope();

  const query = useQuery({
    queryKey: ["analytics", selectedHotelId, selectedDepartmentId],
    queryFn: () => api.get<AnalyticsData>(`/analytics?${params({ tz: timeZone() })}`),
    enabled: ready,
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-500 py-10 justify-center">
        <Spinner /> {t("an.loading")}
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <p className="text-sm text-rose-400 py-10 text-center">
        {query.error instanceof Error && query.error.message ? query.error.message : t("an.loadFailed")}
      </p>
    );
  }

  const data = query.data;
  const runningOutSoon = data.forecasts.filter((f) => f.daysLeft !== null && f.daysLeft <= RUN_OUT_SOON_DAYS).length;
  const reorderTooLow = data.reorderPoints.filter((r) => r.status === "too_low").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-100">{t("nav.analytics")}</h1>
        <p className="text-sm text-ink-500">{t("an.intro", { weeks: Math.round(data.historyDays / 7) })}</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t("an.tileRunOut", { days: RUN_OUT_SOON_DAYS })}
          value={runningOutSoon}
          detail={t("an.tileRunOutHint")}
          href="#forecast"
        />
        <StatTile
          label={t("an.tileReorder")}
          value={data.reorderPoints.length}
          detail={t("an.tooLowHigh", { low: reorderTooLow, high: data.reorderPoints.length - reorderTooLow })}
          href="#reorder"
        />
        <StatTile
          label={t("an.unusual")}
          value={data.anomalies.length}
          detail={t("an.lastDays", { days: data.settings.anomalyWindowDays })}
          href="#unusual"
        />
        <StatTile
          label={t("an.tileIdle")}
          value={money.format(data.deadStockValue)}
          detail={t("an.idleCount", { count: data.deadStock.length })}
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

/** Shows the first rows, with a button to reveal the rest. */
function useCollapsed<T>(rows: T[]) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
  const toggle =
    rows.length > COLLAPSED_ROWS ? (
      <button onClick={() => setExpanded(!expanded)} className="mt-3 text-xs text-gold-400 hover:text-gold-300">
        {expanded ? t("an.showFewer") : t("an.showAll", { count: rows.length })}
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

const th = "px-3 py-2 font-medium whitespace-nowrap";
const td = "px-3 py-2 align-middle";

// ---------------------------------------------------------------- Forecast

function ForecastSection({ data, showHotel }: { data: AnalyticsData; showHotel: boolean }) {
  const t = useT();
  const { qty } = useFormats();
  const { visible, toggle } = useCollapsed(data.forecasts);
  return (
    <Section
      id="forecast"
      title={t("an.forecast")}
      subtitle={t("an.forecastHint", { weeks: data.forecastDays / 7 })}
    >
      {data.forecasts.length === 0 ? (
        <EmptyState>{t("an.forecastEmpty")}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head-row">
                  <th className={th}>{t("an.col.item")}</th>
                  <th className={`${th} text-end`}>{t("an.col.onHand")}</th>
                  <th className={`${th} text-end`}>{t("an.col.next7")}</th>
                  <th className={`${th} text-end`}>{t("an.col.next28")}</th>
                  <th className={th}>{t("an.col.trend")}</th>
                  <th className={th}>{t("an.col.runsOut")}</th>
                  <th className={th}>{t("an.col.weeklyUse")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800">
                {visible.map((f) => (
                  <tr key={f.id}>
                    <td className={td}>
                      <ItemName name={f.name} hotelCode={f.hotelCode} showHotel={showHotel} />
                      {f.confidence === "low" && <p className="text-xs text-ink-500">{t("an.limitedHistory")}</p>}
                    </td>
                    <td className={`${td} text-end tabular-nums text-ink-300 whitespace-nowrap`}>
                      {f.onHand} {f.unit}
                    </td>
                    <td className={`${td} text-end tabular-nums text-ink-300`}>{qty.format(f.next7)}</td>
                    <td className={`${td} text-end tabular-nums text-ink-300`}>{qty.format(f.next28)}</td>
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
  const t = useT();
  if (change === null) return <span className="text-xs text-ink-500">{t("an.notEnoughHistory")}</span>;
  if (Math.abs(change) < 15) return <span className="text-xs text-ink-300">{t("an.steady")}</span>;
  return (
    <span className="text-xs text-ink-300">
      {change > 0 ? t("an.up", { percent: Math.abs(change) }) : t("an.down", { percent: Math.abs(change) })}
    </span>
  );
}

function RunsOut({ forecast }: { forecast: ItemForecast }) {
  const t = useT();
  const { shortDate } = useFormats();
  const { daysLeft, runOutDate } = forecast;
  if (daysLeft === null || !runOutDate) return <span className="text-xs text-ink-500">{t("an.overYear")}</span>;
  const color = daysLeft <= 3 ? STATUS_COLORS.critical : daysLeft <= RUN_OUT_SOON_DAYS ? STATUS_COLORS.warning : null;
  return (
    <span className="flex items-center gap-1.5 text-ink-100">
      {color && <StatusDot color={color} />}
      <span>
        {daysLeft === 0 ? t("an.today") : shortDate.format(new Date(runOutDate))}
        <span className="text-xs text-ink-500"> · {daysLeft === 0 ? t("an.now") : t("an.daysShort", { count: daysLeft })}</span>
      </span>
    </span>
  );
}

/**
 * Weekly usage: past weeks as a solid line, the forecast dashed. One neutral
 * series, so the item name is its label; hover a week for its number.
 */
function Sparkline({ forecast }: { forecast: ItemForecast }) {
  const t = useT();
  const { qty } = useFormats();
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
  // Theme colors, so the chart reads in both light and dark mode.
  const stroke = { stroke: "rgb(var(--ink-200))" };

  return (
    <svg
      // In rem, so the chart grows with the font-size setting; the viewBox keeps the drawing in proportion.
      width={`${width / 16}rem`}
      height={`${height / 16}rem`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t("an.sparkAria", {
        weeks: history.length,
        history: history.map((v) => qty.format(v)).join(", "),
        forecast: forecast.weeklyForecast.map((v) => qty.format(v)).join(", "),
      })}
      className="block"
    >
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} style={{ stroke: "rgb(var(--navy-800))" }} strokeWidth={1} />
      <path d={line(0, split)} fill="none" style={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={line(split, values.length - 1)}
        fill="none"
        style={stroke}
        strokeWidth={2}
        strokeDasharray="3 3"
        strokeOpacity={0.6}
        strokeLinecap="round"
      />
      {values.map((v, i) => {
        const weeksAgo = history.length - 1 - i;
        const amount = `${qty.format(v)} ${forecast.unit}`;
        return (
          // Invisible hit areas, wider than the line, carry each week's number.
          <rect key={i} x={x(i) - step / 2} y={0} width={step} height={height} fill="transparent">
            <title>
              {i <= split
                ? weeksAgo === 0
                  ? t("an.lastWeek", { amount })
                  : t("an.weeksAgo", { count: weeksAgo + 1, amount })
                : t("an.forecastWeek", { count: i - split, amount })}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- Reorder points

function ReorderSection({ data, showHotel }: { data: AnalyticsData; showHotel: boolean }) {
  const t = useT();
  const { qty } = useFormats();
  const { visible, toggle } = useCollapsed(data.reorderPoints);
  const lead = data.leadTime;
  return (
    <Section
      id="reorder"
      title={t("an.reorder")}
      subtitle={
        <>
          {t("an.reorderHint")}{" "}
          {lead.measured
            ? t("an.leadMeasured", { days: qty.format(lead.days), samples: lead.samples })
            : t("an.leadAssumed", { days: lead.days })}
        </>
      }
    >
      {data.reorderPoints.length === 0 ? (
        <EmptyState>{t("an.reorderEmpty")}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head-row">
                  <th className={th}>{t("an.col.item")}</th>
                  <th className={`${th} text-end`}>{t("an.col.current")}</th>
                  <th className={`${th} text-end`}>{t("an.col.suggested")}</th>
                  <th className={th}>{t("an.col.verdict")}</th>
                  <th className={`${th} text-end`}>{t("an.col.dailyUse")}</th>
                  <th className={`${th} text-end`}>{t("an.col.deliveryTime")}</th>
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
  const t = useT();
  const { qty } = useFormats();
  return (
    <tr>
      <td className={td}>
        <ItemName name={r.name} hotelCode={r.hotelCode} showHotel={showHotel} />
      </td>
      <td className={`${td} text-end tabular-nums text-ink-300`}>{r.current}</td>
      <td className={`${td} text-end tabular-nums text-ink-100 font-medium`}>{r.suggested}</td>
      <td className={`${td} whitespace-nowrap`}>
        {r.status === "too_low" ? (
          <span className="flex items-center gap-1.5 text-ink-100">
            <StatusDot color={STATUS_COLORS.warning} />
            {t("an.tooLow")}
          </span>
        ) : (
          <span className="text-ink-300">{t("an.tooHigh")}</span>
        )}
      </td>
      <td className={`${td} text-end tabular-nums text-ink-300 whitespace-nowrap`}>
        {qty.format(r.dailyRate)} {r.unit}
      </td>
      <td className={`${td} text-end text-ink-300 whitespace-nowrap`}>
        {t("an.daysShort", { count: qty.format(r.leadTimeDays) })}
        <span className="text-xs text-ink-500">
          {" "}
          {!r.leadTimeMeasured ? t("an.assumed") : r.leadTimeBasis === "item" ? t("an.thisItem") : t("an.average")}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- Unusual activity

function AnomalySection({ data, showHotel }: { data: AnalyticsData; showHotel: boolean }) {
  const t = useT();
  const { visible, toggle } = useCollapsed(data.anomalies);
  return (
    <Section id="unusual" title={t("an.unusual")} subtitle={t("an.unusualHint", { days: data.settings.anomalyWindowDays })}>
      {data.anomalies.length === 0 ? (
        <EmptyState>{t("an.unusualEmpty")}</EmptyState>
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
  const t = useT();
  const { qty, dateTime } = useFormats();
  const amount = Math.abs(a.quantity);
  const reason =
    a.kind === "large_issue"
      ? t("an.reasonIssue", { quantity: amount, unit: a.unit, typical: qty.format(a.typical) })
      : a.typical > 0
      ? t("an.reasonWriteOff", { quantity: amount, unit: a.unit, weeks: qty.format(amount / a.typical) })
      : t("an.reasonWriteOffIdle", { quantity: amount, unit: a.unit });
  return (
    <li className="py-2 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 text-sm">
      <div className="min-w-0">
        <ItemName name={a.itemName} hotelCode={a.hotelCode} showHotel={showHotel} />
        <p className="text-xs text-ink-300">{reason}</p>
        {a.notes && <p className="text-xs text-ink-500 truncate">{t("an.note", { note: a.notes })}</p>}
      </div>
      <p className="text-xs text-ink-500 whitespace-nowrap">
        {a.performedBy} · {dateTime.format(new Date(a.date))}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------- Dead & slow stock

function IdleSection({ data, showHotel }: { data: AnalyticsData; showHotel: boolean }) {
  const t = useT();
  const { visible, toggle } = useCollapsed(data.deadStock);
  return (
    <Section
      id="idle"
      title={t("an.idle")}
      subtitle={t("an.idleHint", {
        days: data.settings.deadAfterDays,
        months: Math.round(data.settings.slowCoverDays / 30),
      })}
    >
      {data.deadStock.length === 0 ? (
        <EmptyState>{t("an.idleEmpty")}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-head-row">
                  <th className={th}>{t("an.col.item")}</th>
                  <th className={th}>{t("an.col.status")}</th>
                  <th className={`${th} text-end`}>{t("an.col.onHand")}</th>
                  <th className={`${th} text-end`}>{t("an.col.value")}</th>
                  <th className={th}>{t("an.col.lastUsed")}</th>
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
  const t = useT();
  const { money, shortDate } = useFormats();
  return (
    <tr>
      <td className={td}>
        <ItemName name={d.name} hotelCode={d.hotelCode} showHotel={showHotel} />
      </td>
      <td className={`${td} text-ink-300 whitespace-nowrap`}>
        {d.kind === "dead" ? t("an.dead") : t("an.slow", { months: Math.round((d.daysOfCover ?? 0) / 30) })}
      </td>
      <td className={`${td} text-end tabular-nums text-ink-300 whitespace-nowrap`}>
        {d.onHand} {d.unit}
      </td>
      <td className={`${td} text-end tabular-nums text-ink-300`}>{d.value === null ? "—" : money.format(d.value)}</td>
      <td className={`${td} text-ink-300 whitespace-nowrap`}>
        {d.lastUsedAt
          ? t("an.lastUsed", { date: shortDate.format(new Date(d.lastUsedAt)), days: d.idleDays })
          : t("an.never")}
      </td>
    </tr>
  );
}
