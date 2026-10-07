import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { PeriodPicker, toInputDate, usePeriod } from "../../components/PeriodPicker";
import { Spinner } from "../../components/Spinner";
import { AppUser, AuditLogEntry, AuditLogPage } from "../../types";

const ENTITY_TYPES: { value: string; label: string }[] = [
  { value: "", label: "All records" },
  { value: "auth", label: "Sign-ins & passwords" },
  { value: "user", label: "Users" },
  { value: "item", label: "Items" },
  { value: "category", label: "Categories" },
  { value: "work_order", label: "Work orders" },
  { value: "purchase_request", label: "Purchase requests" },
  { value: "hotel", label: "Hotels" },
];

const FIELD_LABELS: Record<string, string> = {
  hotelId: "Hotel",
  departmentId: "Department",
  categoryId: "Category",
  parentId: "Parent group",
  assignedToUserId: "Assigned to",
  quantityOnHand: "Quantity on hand",
  sku: "SKU",
};

function fieldLabel(field: string) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  const words = field.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return <span className="text-ink-600 italic">empty</span>;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function AuditLog() {
  const periodState = usePeriod();
  const { period, invalid: periodInvalid } = periodState;
  const [entityType, setEntityType] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filterParams = new URLSearchParams({
    from: period.from.toISOString(),
    to: period.to.toISOString(),
  });
  if (entityType) filterParams.set("entityType", entityType);
  if (actorUserId) filterParams.set("actorUserId", actorUserId);
  if (debouncedSearch.trim()) filterParams.set("q", debouncedSearch.trim());
  const filterKey = filterParams.toString();

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.get<AppUser[]>("/users") });

  const logQuery = useInfiniteQuery({
    queryKey: ["audit-logs", filterKey],
    queryFn: ({ pageParam }) =>
      api.get<AuditLogPage>(`/audit-logs?${filterKey}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !periodInvalid,
  });

  const entries = logQuery.data?.pages.flatMap((p) => p.entries) ?? [];

  async function handleExport() {
    setExportError(null);
    setDownloading(true);
    try {
      const params = new URLSearchParams(filterKey);
      params.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
      await api.download(
        `/export/audit-log?${params}`,
        `audit-log_${toInputDate(period.from)}_to_${toInputDate(period.to)}.csv`
      );
    } catch (err) {
      setExportError(err instanceof Error && err.message ? err.message : "Could not generate the export.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="card p-5 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-1">
        <h2 className="font-semibold text-ink-100">Audit log</h2>
        <button
          onClick={handleExport}
          disabled={downloading || periodInvalid}
          className="btn-ghost text-xs px-2.5 py-1.5 self-start"
        >
          {downloading ? "Preparing..." : "Export CSV"}
        </button>
      </div>
      <p className="text-sm text-ink-500 mb-5">
        Who changed what, and when. Stock receives, issues and adjustments are in the{" "}
        <Link to="/settings/data" className="text-gold-400 hover:text-gold-300">
          transaction log
        </Link>
        .
      </p>

      <div className="border border-navy-800 rounded-md px-4 py-3 mb-4 space-y-3">
        <PeriodPicker state={periodState} />
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="input-field py-1.5"
            aria-label="Record type"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            value={actorUserId}
            onChange={(e) => setActorUserId(e.target.value)}
            className="input-field py-1.5"
            aria-label="User"
          >
            <option value="">All users</option>
            {usersQuery.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search descriptions…"
            className="input-field py-1.5"
            aria-label="Search"
          />
        </div>
      </div>

      {exportError && <p className="text-sm text-rose-400 mb-3">{exportError}</p>}
      {logQuery.isError && <p className="text-sm text-rose-400">Could not load the audit log.</p>}
      {logQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <Spinner /> Loading…
        </div>
      )}
      {logQuery.isSuccess && entries.length === 0 && (
        <p className="text-sm text-ink-500">Nothing recorded for these filters.</p>
      )}

      <ul className="divide-y divide-navy-800">
        {entries.map((entry) => (
          <AuditRow key={entry.id} entry={entry} />
        ))}
      </ul>

      {logQuery.hasNextPage && (
        <button
          onClick={() => logQuery.fetchNextPage()}
          disabled={logQuery.isFetchingNextPage}
          className="btn-ghost text-xs px-2.5 py-1.5 mt-4"
        >
          {logQuery.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(false);
  const changes = Object.entries(entry.changes ?? {});
  const failed = entry.action === "auth.login_failed";

  return (
    <li className="py-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left flex items-start gap-3 group"
        aria-expanded={open}
      >
        <span className={`mt-0.5 text-ink-600 text-xs transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
          ▶
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${failed ? "text-rose-400" : "text-ink-200 group-hover:text-ink-100"}`}>
            {entry.summary}
          </p>
          <p className="text-xs text-ink-500 mt-0.5">
            {/* A failed sign-in names the targeted account, not someone who actually acted. */}
            {failed
              ? entry.actor
                ? `Attempt on ${entry.actor.name}'s account`
                : "No matching account"
              : entry.actor?.name ?? "Unknown user"}{" "}
            · {dateTimeFormat.format(new Date(entry.createdAt))}
            {changes.length > 0 && ` · ${changes.length} field${changes.length === 1 ? "" : "s"} changed`}
          </p>
        </div>
        <span className="hidden sm:inline shrink-0 font-mono text-[11px] text-ink-500 border border-navy-700 rounded px-1.5 py-0.5">
          {entry.action}
        </span>
      </button>

      {open && (
        <div className="mt-2 ml-6 space-y-2">
          {changes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-ink-500 text-left">
                    <th className="font-normal pr-4 py-1">Field</th>
                    <th className="font-normal pr-4 py-1">Before</th>
                    <th className="font-normal py-1">After</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map(([field, c]) => (
                    <tr key={field} className="border-t border-navy-800">
                      <td className="pr-4 py-1 text-ink-300 whitespace-nowrap">{fieldLabel(field)}</td>
                      <td className="pr-4 py-1 font-mono text-ink-400 break-all">{displayValue(c.from)}</td>
                      <td className="py-1 font-mono text-ink-100 break-all">{displayValue(c.to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-ink-500 font-mono break-all">
            {entry.actor?.email ?? "no signed-in user"} · IP {entry.ip ?? "unknown"} · {entry.action}
          </p>
        </div>
      )}
    </li>
  );
}
