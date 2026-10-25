import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useScope } from "../hooks/useScope";
import { useT } from "../i18n";
import { InventoryItem } from "../types";
import { EmptyState } from "./ui";

/** Items at or below their reorder point, for the dashboards. Shares its cache with any other low-stock count. */
export function useLowStock() {
  const { selectedHotelId, selectedDepartmentId, ready, params } = useScope();
  return useQuery({
    queryKey: ["items", "low-stock", selectedHotelId, selectedDepartmentId],
    queryFn: () => api.get<InventoryItem[]>(`/items?${params({ lowStockOnly: "true" })}`),
    enabled: ready,
  });
}

export function LowStockList() {
  const t = useT();
  const { viewingAllHotels } = useScope();
  const { data } = useLowStock();

  if (data?.length === 0) return <EmptyState>{t("dash.nothingBelow")}</EmptyState>;
  return (
    <ul className="divide-y divide-navy-800">
      {data?.map((item) => (
        <li key={item.id} className="py-2 flex items-center justify-between gap-3 text-sm">
          <Link to="/inventory" className="text-ink-200 hover:text-gold-300 min-w-0 truncate">
            {item.name}
            {viewingAllHotels && item.hotel && <span className="text-ink-600 font-mono"> · {item.hotel.code}</span>}
          </Link>
          <span className="text-rose-400 font-medium font-mono shrink-0">
            {item.quantityOnHand} / {item.reorderPoint} {item.unit}
          </span>
        </li>
      ))}
    </ul>
  );
}
