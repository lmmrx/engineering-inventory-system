export function Footer() {
  return (
    <footer className="border-t border-navy-800 mt-auto">
      <div className="mx-auto max-w-[1600px] px-4 py-4 text-center text-xs text-ink-500">
        © {new Date().getFullYear()} ZSHoldings Ltd. All rights reserved.
      </div>
    </footer>
  );
}
