import { useCallback, useState } from "react";
import { api } from "../../api/client";
import { ReportViewer } from "../../components/ReportViewer";
import { ALL_HOTELS, useHotelScope } from "../../context/HotelScopeContext";
import { useDepartmentScope } from "../../context/DepartmentScopeContext";
import { PeriodPicker, toInputDate, usePeriod } from "../../components/PeriodPicker";

type ReportKind = "stock" | "movement" | "transactions" | "work-orders" | "purchase-requests";

interface Report {
  kind: ReportKind;
  title: string;
  description: string;
  /** Whether the report covers the chosen date range, or is a snapshot of right now. */
  usesPeriod: boolean;
}

// The audit log has its own Export button on the Audit log page, with that page's filters.
const REPORTS: Report[] = [
  {
    kind: "stock",
    title: "Stock",
    description:
      "Every item as of now: stock status, value, days of cover and a suggested order quantity. Out and low items are listed first — filter Status for a reorder list.",
    usesPeriod: false,
  },
  {
    kind: "movement",
    title: "Stock movement",
    description: "Per item: opening balance, received, issued, adjusted and closing balance.",
    usesPeriod: true,
  },
  {
    kind: "transactions",
    title: "Transactions",
    description: "Every receive, issue and adjustment: who, when, how much, and the linked work order or request.",
    usesPeriod: true,
  },
  {
    kind: "work-orders",
    title: "Work orders",
    description: "Work orders opened in the period, with time open and materials issued against each.",
    usesPeriod: true,
  },
  {
    kind: "purchase-requests",
    title: "Purchase requests",
    description: "One row per requested item, with quantities requested, received and outstanding.",
    usesPeriod: true,
  },
];

export function DataExport() {
  const { hotels, selectedHotelId } = useHotelScope();
  const { departments, selectedDepartmentId } = useDepartmentScope();
  const [downloading, setDownloading] = useState<ReportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const periodState = usePeriod();
  const { period, invalid: periodInvalid } = periodState;
  const [viewing, setViewing] = useState<{ report: Report; path: string; label: string } | null>(null);
  const closeViewer = useCallback(() => setViewing(null), []);

  const viewingAllHotels = selectedHotelId === ALL_HOTELS;
  const hotel = hotels.find((h) => h.id === selectedHotelId);
  const department = departments.find((d) => d.id === selectedDepartmentId);

  /** The report's URL for the current hotel, department and date range — shared by the viewer and the download. */
  function reportPath(report: Report) {
    const params = new URLSearchParams({
      departmentId: selectedDepartmentId,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (!viewingAllHotels) params.set("hotelId", selectedHotelId);
    if (report.usesPeriod) {
      params.set("from", period.from.toISOString());
      params.set("to", period.to.toISOString());
    }
    return `/export/${report.kind}?${params}`;
  }

  function periodLabel(report: Report) {
    return report.usesPeriod ? `${toInputDate(period.from)} to ${toInputDate(period.to)}` : `as of ${toInputDate(new Date())}`;
  }

  async function handleDownload(report: Report) {
    setError(null);
    setDownloading(report.kind);
    try {
      const scopeName = [department?.code, viewingAllHotels ? "ALL-HOTELS" : hotel?.code].filter(Boolean).join("_");
      const dateName = report.usesPeriod
        ? `${toInputDate(period.from)}_to_${toInputDate(period.to)}`
        : toInputDate(new Date());
      await api.download(reportPath(report), `${report.kind}_${scopeName}_${dateName}.csv`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not generate the export. Try again in a moment.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="card p-5 max-w-2xl">
      <h2 className="font-semibold text-ink-100 mb-1">Reports & exports</h2>
      <p className="text-sm text-ink-500 mb-5">
        CSV files for {department?.name ?? "your department"} ·{" "}
        {viewingAllHotels ? "all hotels" : hotel?.name ?? "your hotel"}. They open directly in Excel or Google
        Sheets. Times are in your time zone.
      </p>

      <div className="border border-navy-800 rounded-md px-4 py-3 mb-3">
        <p className="text-xs uppercase tracking-wide text-ink-500 mb-2">Date range</p>
        <PeriodPicker state={periodState} />
      </div>

      <div className="space-y-3">
        {REPORTS.map((report) => {
          const busy = downloading === report.kind;
          return (
            <div
              key={report.kind}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-navy-800 rounded-md px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-100">
                  {report.title}
                  {!report.usesPeriod && <span className="ml-2 text-xs font-normal text-ink-500">as of now</span>}
                </p>
                <p className="text-xs text-ink-500">{report.description}</p>
              </div>
              <div className="flex gap-2 self-start sm:self-center flex-none">
                <button
                  onClick={() => {
                    setError(null);
                    // Freezes the URL, so changing the date range behind the viewer doesn't change what it shows.
                    setViewing({ report, path: reportPath(report), label: periodLabel(report) });
                  }}
                  disabled={report.usesPeriod && periodInvalid}
                  className="btn-ghost text-xs px-2.5 py-1.5"
                >
                  View
                </button>
                <button
                  onClick={() => handleDownload(report)}
                  disabled={busy || (report.usesPeriod && periodInvalid)}
                  className="btn-ghost text-xs px-2.5 py-1.5"
                >
                  {busy ? "Preparing..." : "Download CSV"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-ink-500 mt-4">The audit log is exported from its own page, Settings → Audit log.</p>

      {error && <p className="text-sm text-rose-400 mt-4">{error}</p>}

      {viewing && (
        <ReportViewer
          title={viewing.report.title}
          subtitle={`${department?.name ?? "Your department"} · ${
            viewingAllHotels ? "All hotels" : hotel?.name ?? "your hotel"
          } · ${viewing.label}`}
          path={viewing.path}
          onDownload={() => handleDownload(viewing.report)}
          downloading={downloading === viewing.report.kind}
          downloadError={error}
          onClose={closeViewer}
        />
      )}
    </div>
  );
}
