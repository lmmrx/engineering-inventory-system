import { useState } from "react";
import { api } from "../../api/client";
import { useHotelScope } from "../../context/HotelScopeContext";

export function DataExport() {
  const { hotels, selectedHotelId, canSwitchHotels } = useHotelScope();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hotelCode = hotels.find((h) => h.id === selectedHotelId)?.code;

  async function handleDownload(kind: "inventory" | "transactions") {
    setError(null);
    setDownloading(kind);
    try {
      const scope = canSwitchHotels ? "" : `?hotelId=${selectedHotelId}`;
      await api.download(`/export/${kind}${scope}`, `${kind}-export.csv`);
    } catch {
      setError("Could not generate the export. Try again in a moment.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="card p-5 max-w-lg">
      <h2 className="font-semibold text-ink-100 mb-1">Export data</h2>
      <p className="text-sm text-ink-500 mb-5">
        {canSwitchHotels
          ? "Download a CSV across all hotels."
          : `Download a CSV for ${hotelCode ?? "your hotel"}.`}
      </p>

      <div className="space-y-3">
        <div className="flex items-center justify-between border border-navy-800 rounded-md px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink-100">Inventory</p>
            <p className="text-xs text-ink-500">Every item, with quantity on hand and reorder point.</p>
          </div>
          <button
            onClick={() => handleDownload("inventory")}
            disabled={downloading === "inventory"}
            className="btn-ghost text-xs px-2.5 py-1.5"
          >
            {downloading === "inventory" ? "Preparing..." : "Download CSV"}
          </button>
        </div>

        <div className="flex items-center justify-between border border-navy-800 rounded-md px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink-100">Transaction history</p>
            <p className="text-xs text-ink-500">Every receive, issue, and adjustment (most recent 5,000).</p>
          </div>
          <button
            onClick={() => handleDownload("transactions")}
            disabled={downloading === "transactions"}
            className="btn-ghost text-xs px-2.5 py-1.5"
          >
            {downloading === "transactions" ? "Preparing..." : "Download CSV"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-400 mt-4">{error}</p>}
    </div>
  );
}
