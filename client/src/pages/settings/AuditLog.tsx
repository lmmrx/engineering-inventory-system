import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { PeriodPicker, toInputDate, usePeriod } from "../../components/PeriodPicker";
import { Spinner } from "../../components/Spinner";
import { AppUser, AuditLogEntry, AuditLogPage } from "../../types";
import { MessageKey, useLocale, useT } from "../../i18n";
import { en } from "../../i18n/en";
import { usePreferences } from "../../context/PreferencesContext";

const ENTITY_TYPES = ["", "auth", "user", "item", "category", "work_order", "purchase_request", "hotel"] as const;

/** A readable name for a changed field, in the reader's language when we know it. */
function useFieldLabel() {
  const t = useT();
  return (field: string) => {
    const key = `audit.field.${field}` as MessageKey;
    if (key in en) return t(key);
    const words = field.replace(/([A-Z])/g, " $1").toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  };
}

function DisplayValue({ value }: { value: unknown }) {
  const t = useT();
  if (value === null || value === undefined || value === "") return <span className="text-ink-600 italic">{t("audit.emptyValue")}</span>;
  return <>{typeof value === "object" ? JSON.stringify(value) : String(value)}</>;
}

export function AuditLog() {
  const t = useT();
  const { preferences } = usePreferences();
  const periodState = usePeriod();
  const { period, invalid: periodInvalid } = periodState;
  const [entityType, setEntityType] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
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
      setExportError(err instanceof Error && err.message ? err.message : t("audit.exportFailed"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="card p-5 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-1">
        <h2 className="font-semibold text-ink-100">{t("settings.auditLog")}</h2>
        <button
          onClick={handleExport}
          disabled={downloading || periodInvalid}
          className="btn-ghost text-xs px-2.5 py-1.5 self-start"
        >
          {downloading ? t("common.preparing") : t("common.exportCsv")}
        </button>
      </div>
      <p className="text-sm text-ink-500 mb-5">
        {t("audit.description")}{" "}
        <Link to="/settings/data" className="text-gold-400 hover:text-gold-300">
          {t("audit.openReports")}
        </Link>
        {preferences.language !== "en" && <span className="block text-xs mt-1">{t("audit.summariesEnglish")}</span>}
      </p>

      <div className="border border-navy-800 rounded-md px-4 py-3 mb-4 space-y-3">
        <PeriodPicker state={periodState} />
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="input-field py-1.5"
            aria-label={t("audit.recordType")}
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(type ? (`audit.type.${type}` as MessageKey) : "audit.type.all")}
              </option>
            ))}
          </select>
          <select
            value={actorUserId}
            onChange={(e) => setActorUserId(e.target.value)}
            className="input-field py-1.5"
            aria-label={t("audit.user")}
          >
            <option value="">{t("audit.allUsers")}</option>
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
            placeholder={t("audit.searchPlaceholder")}
            className="input-field py-1.5"
            aria-label={t("audit.search")}
          />
        </div>
      </div>

      {exportError && <p className="text-sm text-rose-400 mb-3">{exportError}</p>}
      {logQuery.isError && <p className="text-sm text-rose-400">{t("audit.loadFailed")}</p>}
      {logQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <Spinner /> {t("common.loading")}
        </div>
      )}
      {logQuery.isSuccess && entries.length === 0 && (
        <p className="text-sm text-ink-500">{t("audit.empty")}</p>
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
          {logQuery.isFetchingNextPage ? t("common.loading") : t("common.loadMore")}
        </button>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const t = useT();
  const fieldLabel = useFieldLabel();
  const locale = useLocale();
  const dateTimeFormat = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const [open, setOpen] = useState(false);
  const changes = Object.entries(entry.changes ?? {});
  const failed = entry.action === "auth.login_failed";

  return (
    <li className="py-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-start flex items-start gap-3 group"
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
                ? t("audit.attemptOn", { name: entry.actor.name })
                : t("audit.noAccount")
              : entry.actor?.name ?? t("audit.unknownUser")}{" "}
            · {dateTimeFormat.format(new Date(entry.createdAt))}
            {changes.length > 0 &&
              ` · ${changes.length === 1 ? t("audit.fieldChanged") : t("audit.fieldsChanged", { count: changes.length })}`}
          </p>
        </div>
        <span className="hidden sm:inline shrink-0 font-mono text-[0.6875rem] text-ink-500 border border-navy-700 rounded px-1.5 py-0.5">
          {entry.action}
        </span>
      </button>

      {open && (
        <div className="mt-2 ms-6 space-y-2">
          {changes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-ink-500 text-start">
                    <th className="font-normal pe-4 py-1">{t("audit.col.field")}</th>
                    <th className="font-normal pe-4 py-1">{t("audit.col.before")}</th>
                    <th className="font-normal py-1">{t("audit.col.after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map(([field, c]) => (
                    <tr key={field} className="border-t border-navy-800">
                      <td className="pe-4 py-1 text-ink-300 whitespace-nowrap">{fieldLabel(field)}</td>
                      <td className="pe-4 py-1 font-mono text-ink-400 break-all"><DisplayValue value={c.from} /></td>
                      <td className="py-1 font-mono text-ink-100 break-all"><DisplayValue value={c.to} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-ink-500 font-mono break-all">
            {entry.actor?.email ?? t("audit.noSignedInUser")} · {t("audit.ip", { ip: entry.ip ?? t("audit.unknown") })} ·{" "}
            {entry.action}
          </p>
        </div>
      )}
    </li>
  );
}
