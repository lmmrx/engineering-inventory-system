import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Spinner } from "./Spinner";

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
  const allRows = query.data?.rows ?? [];

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
          {downloading ? "Preparing..." : "Download CSV"}
        </button>
        <button onClick={onClose} className="btn-ghost text-xs px-2.5 py-1.5" aria-label="Close report">
          Close
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
            : "Could not load the report. Try again in a moment."}
        </div>
      )}

      {query.data && (
        <>
          <div className="px-4 py-2 flex flex-wrap items-center gap-3 border-b border-navy-800">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search this report"
              className="input-field w-full sm:w-72 py-1.5"
              aria-label="Search this report"
            />
            <p className="text-xs text-ink-500">
              {rows.length === allRows.length
                ? `${allRows.length} row${allRows.length === 1 ? "" : "s"}`
                : `${rows.length} of ${allRows.length} rows`}
              {rows.length > MAX_VISIBLE_ROWS && ` · showing the first ${MAX_VISIBLE_ROWS} — search to narrow down, or download the CSV for all`}
              {" · click a column to sort"}
            </p>
          </div>

          {allRows.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-ink-500">
              Nothing to show for this selection.
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="text-xs w-full">
                <thead className="sticky top-0 bg-navy-900 z-10">
                  <tr className="text-ink-500 text-left uppercase tracking-wide border-b border-navy-800">
                    {header.map((label, col) => (
                      <th key={label} className={`px-3 py-2 font-medium whitespace-nowrap ${numericColumns[col] ? "text-right" : ""}`}>
                        <button onClick={() => toggleSort(col)} className="uppercase tracking-wide hover:text-ink-100">
                          {label}
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
                            numericColumns[col] ? "text-right tabular-nums whitespace-nowrap" : "max-w-xs"
                          }`}
                        >
                          {col === statusColumn && typeof cell === "string" && STATUS_STYLE[cell] ? (
                            <span className={`px-1.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[cell]}`}>{cell}</span>
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
