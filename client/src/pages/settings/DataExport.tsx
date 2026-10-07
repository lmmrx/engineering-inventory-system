import { useState } from "react";
import { api } from "../../api/client";
import { ALL_HOTELS, useHotelScope } from "../../context/HotelScopeContext";
import { useDepartmentScope } from "../../context/DepartmentScopeContext";
import { TransactionType } from "../../types";
import { PeriodPicker, toInputDate, usePeriod } from "../../components/PeriodPicker";

type ReportKind =
  | "inventory"
  | "reorder"
  | "movement"
  | "transactions"
  | "work-orders"
  | "purchase-requests"
  | "audit-log";

interface Report {
  kind: ReportKind;
  title: string;
  description: string;
}

const SNAPSHOT_REPORTS: Report[] = [
  {
    kind: "inventory",
    title: "Inventory & valuation",
    description: "Every item with category, stock status, unit cost and total value.",
  },
  {
    kind: "reorder",
    title: "Reorder list",
    description:
      "Low and out-of-stock items, most urgent first, with days of cover and a suggested order quantity (up to max level, or 2× reorder point) net of open purchase requests.",
  },
];

const PERIOD_REPORTS: Report[] = [
  {
    kind: "movement",
    title: "Stock movement",
    description: "Opening balance, received, issued, adjusted and closing balance per item.",
  },
  {
    kind: "transactions",
    title: "Transaction log",
    description: "Every receive, issue and adjustment: who, when, how much, and the linked work order or request.",
  },
  {
    kind: "work-orders",
    title: "Work orders",
    description: "Work orders opened in the period, with time open and materials issued against each.",
  },
  {
    kind: "purchase-requests",
    title: "Purchase requests",
    description: "One row per requested item, with quantities requested, received and outstanding.",
  },
  {
    kind: "audit-log",
    title: "Audit log",
    description: "Sign-ins and every change to items, users, categories, work orders and purchase requests, with before and after values.",
  },
];

export function DataExport() {
  const { hotels, selectedHotelId } = useHotelScope();
  const { departments, selectedDepartmentId } = useDepartmentScope();
  const [downloading, setDownloading] = useState<ReportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const periodState = usePeriod();
  const { period, invalid: periodInvalid } = periodState;
  const [transactionType, setTransactionType] = useState<TransactionType | "">("");

  const viewingAllHotels = selectedHotelId === ALL_HOTELS;
  const hotel = hotels.find((h) => h.id === selectedHotelId);
  const department = departments.find((d) => d.id === selectedDepartmentId);

  async function handleDownload(report: Report, usesPeriod: boolean) {
    setError(null);
    setDownloading(report.kind);
    try {
      const params = new URLSearchParams({
        departmentId: selectedDepartmentId,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!viewingAllHotels) params.set("hotelId", selectedHotelId);
      if (usesPeriod) {
        params.set("from", period.from.toISOString());
        params.set("to", period.to.toISOString());
      }
      if (report.kind === "transactions" && transactionType) params.set("type", transactionType);

      const scopeName = [department?.code, viewingAllHotels ? "ALL-HOTELS" : hotel?.code].filter(Boolean).join("_");
      const dateName = usesPeriod
        ? `${toInputDate(period.from)}_to_${toInputDate(period.to)}`
        : toInputDate(new Date());
      await api.download(`/export/${report.kind}?${params}`, `${report.kind}_${scopeName}_${dateName}.csv`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not generate the export. Try again in a moment.");
    } finally {
      setDownloading(null);
    }
  }

  function reportRow(report: Report, usesPeriod: boolean) {
    const busy = downloading === report.kind;
    return (
      <div
        key={report.kind}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-navy-800 rounded-md px-4 py-3"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-100">{report.title}</p>
          <p className="text-xs text-ink-500">{report.description}</p>
          {report.kind === "transactions" && (
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value as TransactionType | "")}
              className="input-field mt-2 w-auto py-1 text-xs"
              aria-label="Transaction type"
            >
              <option value="">All types</option>
              <option value="RECEIVE">Receives only</option>
              <option value="ISSUE">Issues only</option>
              <option value="ADJUSTMENT">Adjustments only</option>
            </select>
          )}
        </div>
        <button
          onClick={() => handleDownload(report, usesPeriod)}
          disabled={busy || (usesPeriod && periodInvalid)}
          className="btn-ghost text-xs px-2.5 py-1.5 self-start sm:self-center"
        >
          {busy ? "Preparing..." : "Download CSV"}
        </button>
      </div>
    );
  }

  return (
    <div className="card p-5 max-w-2xl">
      <h2 className="font-semibold text-ink-100 mb-1">Reports & exports</h2>
      <p className="text-sm text-ink-500 mb-5">
        CSV files for {department?.name ?? "your department"} ·{" "}
        {viewingAllHotels ? "all hotels" : hotel?.name ?? "your hotel"}. They open directly in Excel or Google
        Sheets. Times are in your time zone.
      </p>

      <h3 className="text-xs uppercase tracking-wide text-ink-500 mb-2">Current stock</h3>
      <div className="space-y-3 mb-6">{SNAPSHOT_REPORTS.map((r) => reportRow(r, false))}</div>

      <h3 className="text-xs uppercase tracking-wide text-ink-500 mb-2">Activity for a period</h3>
      <div className="border border-navy-800 rounded-md px-4 py-3 mb-3">
        <PeriodPicker state={periodState} />
      </div>
      <div className="space-y-3">{PERIOD_REPORTS.map((r) => reportRow(r, true))}</div>

      {error && <p className="text-sm text-rose-400 mt-4">{error}</p>}
    </div>
  );
}
