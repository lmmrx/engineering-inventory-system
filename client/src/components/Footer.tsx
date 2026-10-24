import { useT } from "../i18n";

export function Footer() {
  const t = useT();
  return (
    <footer className="border-t border-navy-800 mt-auto">
      <div className="mx-auto max-w-[1600px] px-4 py-4 text-center text-xs text-ink-500">
        © {new Date().getFullYear()} ZSHoldings Ltd. {t("footer.rights")}
      </div>
    </footer>
  );
}
