import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Spinner } from "./Spinner";
import { MessageKey, useT } from "../i18n";

// The server sends English column names (they're also the CSV's); the viewer
// shows them in the reader's language.
const COLUMN_KEYS: Record<string, MessageKey> = {
  "Hotel": "rpt.col.hotel",
  "Group": "rpt.col.group",
  "Subcategory": "rpt.col.subcategory",
  "Item": "rpt.col.item",
  "SKU": "rpt.col.sku",
  "Unit": "rpt.col.unit",
  "Location": "rpt.col.location",
  "On Hand": "rpt.col.on_hand",
  "Reorder Point": "rpt.col.reorder_point",
  "Max Level": "rpt.col.max_level",
  "Status": "rpt.col.status",
  "Forecast Daily Use": "rpt.col.forecast_daily_use",
  "Days of Cover": "rpt.col.days_of_cover",
  "On Open Purchase Requests": "rpt.col.on_open_purchase_requests",
  "Suggested Order Qty": "rpt.col.suggested_order_qty",
  "Unit Cost": "rpt.col.unit_cost",
  "Stock Value": "rpt.col.stock_value",
  "Est. Order Cost": "rpt.col.est_order_cost",
  "Opening": "rpt.col.opening",
  "Received": "rpt.col.received",
  "Issued": "rpt.col.issued",
  "Adjusted": "rpt.col.adjusted",
  "Closing": "rpt.col.closing",
  "Avg Daily Use": "rpt.col.avg_daily_use",
  "Value Issued": "rpt.col.value_issued",
  "Date": "rpt.col.date",
  "Type": "rpt.col.type",
  "Quantity": "rpt.col.quantity",
  "Value": "rpt.col.value",
  "Performed By": "rpt.col.performed_by",
  "Work Order": "rpt.col.work_order",
  "Work Order Title": "rpt.col.work_order_title",
  "Purchase Request": "rpt.col.purchase_request",
  "Notes": "rpt.col.notes",
  "Created": "rpt.col.created",
  "Title": "rpt.col.title",
  "Created By": "rpt.col.created_by",
  "Assigned To": "rpt.col.assigned_to",
  "Completed": "rpt.col.completed",
  "Days Open": "rpt.col.days_open",
  "Items Issued": "rpt.col.items_issued",
  "Materials Cost": "rpt.col.materials_cost",
  "Description": "rpt.col.description",
  "Requested By": "rpt.col.requested_by",
  "Approved/Rejected By": "rpt.col.approved_rejected_by",
  "Decided At": "rpt.col.decided_at",
  "Received At": "rpt.col.received_at",
  "Qty Requested": "rpt.col.qty_requested",
  "Qty Received": "rpt.col.qty_received",
  "Qty Outstanding": "rpt.col.qty_outstanding",
  "Estimated Cost": "rpt.col.estimated_cost",
};

// Status and type values the viewer translates, in the Status and Type columns.
const VALUE_KEYS: Record<string, MessageKey> = {
  "Out of stock": "health.out",
  Low: "health.low",
  "Over max": "health.over",
  OK: "stock.ok",
  Receive: "rpt.val.receive",
  Issue: "rpt.val.issue",
  Adjustment: "rpt.val.adjustment",
  Pending: "pr.status.PENDING",
  Approved: "pr.status.APPROVED",
  Rejected: "pr.status.REJECTED",
  Received: "pr.status.RECEIVED",
  Open: "wo.status.OPEN",
  "In progress": "wo.status.IN_PROGRESS",
  Completed: "wo.status.COMPLETED",
};
const TRANSLATED_COLUMNS = ["Status", "Type"];

type Cell = string | number | null;

interface ReportData {
  header: string[];
  rows: Cell[][];
}

// Drawing tens of thousands of rows would freeze a phone; search narrows it down, and the CSV has everything.
const MAX_VISIBLE_ROWS = 500;

const STATUS_STYLE: Record<string, string> = {
  "Out of stock": "bg-rose-500/15 text-rose-300",
  Low: "bg-amber-500/15 text-amber-300",
  "Over max": "bg-sky-500/15 text-sky-300",
  OK: "bg-emerald-500/15 text-emerald-300",
};

/** Numbers and money strings ("12.50") sort and align as numbers; blanks count as empty, not zero. */
function asNumber(value: Cell): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return null;
}

export function ReportViewer({
  title,
  subtitle,
  path,
  onDownload,
  downloading,
  downloadError,
  onClose,
}: {
  title: string;
  subtitle: string;
  /** The export URL; the viewer asks for the same report as JSON. */
  path: string;
  onDownload: () => void;
  downloading: boolean;
  downloadError: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ column: number; descending: boolean } | null>(null);

  const query = useQuery({
    queryKey: ["report", path],
    queryFn: () => api.get<ReportData>(`${path}&format=json`),
    // Reports are a snapshot of the moment they're opened; don't refetch underneath the reader.
    staleTime: Infinity,
    gcTime: 0,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const header = query.data?.header ?? [];
  const translatedColumns = header.map((h, i) => (TRANSLATED_COLUMNS.includes(h) ? i : -1)).filter((i) => i >= 0);
  // Status and type values in the reader's language, so they read, search and sort that way.
  const allRows = useMemo(
    () =>
      (query.data?.rows ?? []).map((row) =>
        translatedColumns.length === 0
          ? row
          : row.map((cell, i) =>
              translatedColumns.includes(i) && typeof cell === "string" && VALUE_KEYS[cell] ? t(VALUE_KEYS[cell]) : cell
            )
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data, t]
  );
  // Badge colors, keyed by the translated status text.
  const statusStyle = useMemo(
    () => Object.fromEntries(Object.entries(STATUS_STYLE).map(([english, style]) => [t(VALUE_KEYS[english]), style])),
    [t]
  );

  // Which columns hold numbers, so they can be right-aligned.
  const numericColumns = useMemo(
    () =>
      header.map((_, col) => {
        const filled = allRows.filter((row) => row[col] !== "" && row[col] != null);
        return filled.length > 0 && filled.every((row) => asNumber(row[col]) !== null);
      }),
    [header, allRows]
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let result = needle
      ? allRows.filter((row) => row.some((cell) => String(cell ?? "").toLowerCase().includes(needle)))
      : allRows;
    if (sort) {
      const { column, descending } = sort;
      result = [...result].sort((a, b) => {
        const an = asNumber(a[column]);
        const bn = asNumber(b[column]);
        const blankA = a[column] === "" || a[column] == null;
        const blankB = b[column] === "" || b[column] == null;
        // Blanks always go last, whichever way the column is sorted.
        if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;
        const order = an !== null && bn !== null ? an - bn : String(a[column]).localeCompare(String(b[column]));
        return descending ? -order : order;
      });
    }
    return result;
  }, [allRows, search, sort]);

  function toggleSort(column: number) {
    setSort((current) =>
      current?.column !== column
        ? { column, descending: false }
        : current.descending
        ? null
        : { column, descending: true }
    );
  }

  const statusColumn = header.indexOf("Status");
  const visible = rows.slice(0, MAX_VISIBLE_ROWS);

  return (
    <div
      className="fixed inset-0 z-50 bg-navy-950 flex flex-col pt-[env(safe-area-inset-top)]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="border-b border-navy-800 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink-100">{title}</h2>
          <p className="text-xs text-ink-500 truncate">{subtitle}</p>
        </div>
        <button onClick={onDownload} disabled={downloading} className="btn-ghost text-xs px-2.5 py-1.5">
          {downloading ? t("common.preparing") : t("common.downloadCsv")}
        </button>
        <button onClick={onClose} className="btn-ghost text-xs px-2.5 py-1.5" aria-label={t("rpt.close")}>
          {t("common.close")}
        </button>
        {downloadError && <p className="w-full text-xs text-rose-400">{downloadError}</p>}
      </div>

      {query.isLoading && (
        <div className="flex-1 flex items-center justify-center gap-2 text-sm text-ink-500">
          <Spinner /> Loading report...
        </div>
      )}

      {query.isError && (
        <div className="flex-1 flex items-center justify-center px-4 text-sm text-rose-400 text-center">
          {query.error instanceof Error && query.error.message
            ? query.error.message
            : t("rpt.loadFailed")}
        </div>
      )}

      {query.data && (
        <>
          <div className="px-4 py-2 flex flex-wrap items-center gap-3 border-b border-navy-800">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("rpt.search")}
              className="input-field w-full sm:w-72 py-1.5"
              aria-label={t("rpt.search")}
            />
            <p className="text-xs text-ink-500">
              {rows.length === allRows.length
                ? allRows.length === 1
                  ? t("rpt.rowCountOne")
                  : t("rpt.rowCount", { count: allRows.length })
                : t("rpt.rowsOf", { shown: rows.length, total: allRows.length })}
              {rows.length > MAX_VISIBLE_ROWS && t("rpt.truncated", { limit: MAX_VISIBLE_ROWS })}
              {t("rpt.sortHint")}
            </p>
          </div>

          {allRows.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-ink-500">
              {t("rpt.empty")}
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="text-xs w-full">
                <thead className="sticky top-0 bg-navy-900 z-10">
                  <tr className="text-ink-500 text-start uppercase tracking-wide border-b border-navy-800">
                    {header.map((label, col) => (
                      <th key={label} className={`px-3 py-2 font-medium whitespace-nowrap ${numericColumns[col] ? "text-end" : "text-start"}`}>
                        <button onClick={() => toggleSort(col)} className="uppercase tracking-wide hover:text-ink-100">
                          {COLUMN_KEYS[label] ? t(COLUMN_KEYS[label]) : label}
                          {sort?.column === col && (sort.descending ? " ↓" : " ↑")}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, i) => (
                    <tr key={i} className="border-b border-navy-800/60 hover:bg-navy-900">
                      {row.map((cell, col) => (
                        <td
                          key={col}
                          className={`px-3 py-1.5 text-ink-300 align-top ${
                            numericColumns[col] ? "text-end tabular-nums whitespace-nowrap" : "max-w-xs"
                          }`}
                        >
                          {col === statusColumn && typeof cell === "string" && statusStyle[cell] ? (
                            <span className={`px-1.5 py-0.5 rounded-full whitespace-nowrap ${statusStyle[cell]}`}>{cell}</span>
                          ) : (
                            cell
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
