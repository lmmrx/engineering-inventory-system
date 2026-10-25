import { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Small building blocks shared by the dashboards and Analytics, so tiles,
 * sections and status colors look and behave the same everywhere.
 */

// Reserved for stock state and never reused for anything else; always shown
// next to a text label, so color never carries meaning on its own.
export const STATUS_COLORS = {
  critical: "#d03b3b",
  warning: "#fab219",
  good: "#0ca30c",
  info: "#58a6ff",
} as const;

export function StatusDot({ color }: { color: string }) {
  return <span className="h-2 w-2 rounded-full flex-none" style={{ backgroundColor: color }} aria-hidden="true" />;
}

/** A headline number. Links to a page (`to`) or a spot on this page (`href`) when given. */
export function StatTile({
  label,
  value,
  detail,
  to,
  href,
}: {
  label: string;
  value?: ReactNode;
  detail?: ReactNode;
  to?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink-100 font-mono tabular-nums">{value ?? "—"}</div>
      <div className="mt-1 text-xs text-ink-500">{detail || " "}</div>
    </>
  );
  const linked = "card p-4 block transition hover:border-navy-600";
  if (to) return <Link to={to} className={linked}>{body}</Link>;
  if (href) return <a href={href} className={linked}>{body}</a>;
  return <div className="card p-4">{body}</div>;
}

/** A titled card. `aside` sits opposite the title (e.g. a count). */
export function Section({
  id,
  title,
  subtitle,
  aside,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card p-4 scroll-mt-20">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-ink-100">{title}</h2>
        {aside}
      </div>
      {subtitle ? <p className="text-xs text-ink-500 mb-3">{subtitle}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-500">{children}</p>;
}
