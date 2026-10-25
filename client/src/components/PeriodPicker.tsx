import { useState } from "react";
import { MessageKey, useT } from "../i18n";

type Preset = "last7" | "last30" | "thisMonth" | "lastMonth" | "custom";

const PRESETS: { key: Preset; label: MessageKey }[] = [
  { key: "last7", label: "period.last7" },
  { key: "last30", label: "period.last30" },
  { key: "thisMonth", label: "period.thisMonth" },
  { key: "lastMonth", label: "period.lastMonth" },
  { key: "custom", label: "period.custom" },
];

export function toInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromInputDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Resolves a preset to whole local days: from the start of the first to the end of the last. */
function resolvePeriod(preset: Preset, customFrom: string, customTo: string): { from: Date; to: Date } {
  const today = new Date();
  let first: Date;
  let last = today;
  if (preset === "last7") first = daysAgo(6);
  else if (preset === "last30") first = daysAgo(29);
  else if (preset === "thisMonth") first = new Date(today.getFullYear(), today.getMonth(), 1);
  else if (preset === "lastMonth") {
    first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    last = new Date(today.getFullYear(), today.getMonth(), 0);
  } else {
    first = fromInputDate(customFrom);
    last = fromInputDate(customTo);
  }
  return {
    from: new Date(first.getFullYear(), first.getMonth(), first.getDate()),
    to: new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999),
  };
}

export function usePeriod() {
  const [preset, setPreset] = useState<Preset>("last30");
  const [customFrom, setCustomFrom] = useState(toInputDate(daysAgo(29)));
  const [customTo, setCustomTo] = useState(toInputDate(new Date()));

  const period = resolvePeriod(preset, customFrom, customTo);
  const invalid = preset === "custom" && (!customFrom || !customTo || period.from > period.to);

  return { period, invalid, preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo };
}

export type PeriodState = ReturnType<typeof usePeriod>;

export function PeriodPicker({ state }: { state: PeriodState }) {
  const t = useT();
  const { period, invalid, preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo } = state;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`rounded-md border px-2.5 py-1 text-xs transition ${
              preset === p.key
                ? "border-gold-500 bg-gold-500/15 text-gold-300"
                : "border-navy-700 text-ink-300 hover:border-navy-600"
            }`}
          >
            {t(p.label)}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <input
            type="date"
            value={customFrom}
            max={customTo}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="input-field w-auto py-1"
            aria-label={t("period.start")}
          />
          <span className="text-ink-500">–</span>
          <input
            type="date"
            value={customTo}
            min={customFrom}
            onChange={(e) => setCustomTo(e.target.value)}
            className="input-field w-auto py-1"
            aria-label={t("period.end")}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-ink-500">
        {invalid
          ? t("period.invalid")
          : t("period.summary", { from: toInputDate(period.from), to: toInputDate(period.to) })}
      </p>
    </div>
  );
}
