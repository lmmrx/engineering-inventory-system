import { ReactNode } from "react";
import { useT } from "../i18n";

export function Modal({
  title,
  children,
  onClose,
  maxWidth = "max-w-md",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  const t = useT();
  return (
    <div className="modal-overlay">
      <div className={`modal-panel ${maxWidth}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink-100">{title}</h2>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-100" aria-label={t("common.close")}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label-field">{label}</span>
      {children}
    </label>
  );
}

export function ModalActions({
  onClose,
  submitting,
  submitLabel,
  disabled = false,
}: {
  onClose: () => void;
  submitting: boolean;
  submitLabel: string;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onClose} className="btn-ghost">
        {t("common.cancel")}
      </button>
      <button type="submit" disabled={submitting || disabled} className="btn-primary">
        {submitting ? t("common.saving") : submitLabel}
      </button>
    </div>
  );
}
