import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { ALL_HOTELS, useHotelScope } from "../context/HotelScopeContext";
import { useDepartmentScope } from "../context/DepartmentScopeContext";
import { InventoryItem, StockTransaction } from "../types";

export function Dashboard() {
  const { selectedHotelId } = useHotelScope();
  const { selectedDepartmentId } = useDepartmentScope();
  const viewingAllHotels = selectedHotelId === ALL_HOTELS;
  const hotelParam = viewingAllHotels ? "" : `hotelId=${selectedHotelId}&`;
  const ready = !!selectedHotelId && !!selectedDepartmentId;

  const lowStockQuery = useQuery({
    queryKey: ["items", "low-stock", selectedHotelId, selectedDepartmentId],
    queryFn: () =>
      api.get<InventoryItem[]>(`/items?${hotelParam}departmentId=${selectedDepartmentId}&lowStockOnly=true`),
    enabled: ready,
  });

  const activityQuery = useQuery({
    queryKey: ["transactions", selectedHotelId, selectedDepartmentId],
    queryFn: () => api.get<StockTransaction[]>(`/transactions?${hotelParam}departmentId=${selectedDepartmentId}`),
    enabled: ready,
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="card p-4">
        <h2 className="font-semibold text-ink-100 mb-3">Low stock alerts</h2>
        {lowStockQuery.data?.length === 0 && <p className="text-sm text-ink-500">Nothing below reorder point.</p>}
        <ul className="divide-y divide-navy-800">
          {lowStockQuery.data?.map((item) => (
            <li key={item.id} className="py-2 flex items-center justify-between text-sm">
              <Link to="/inventory" className="text-ink-200 hover:text-gold-300">
                {item.name}
                {viewingAllHotels && item.hotel && (
                  <span className="text-ink-600 font-normal font-mono"> · {item.hotel.code}</span>
                )}
              </Link>
              <span className="text-rose-400 font-medium font-mono">
                {item.quantityOnHand} / {item.reorderPoint} {item.unit}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold text-ink-100 mb-3">Recent activity</h2>
        <ul className="divide-y divide-navy-800">
          {activityQuery.data?.slice(0, 10).map((tx) => (
            <li key={tx.id} className="py-2 text-sm flex items-center justify-between">
              <span className="text-ink-200">
                {tx.type} · {tx.item?.name ?? tx.itemId}
                {viewingAllHotels && tx.item?.hotel && (
                  <span className="text-ink-600 font-mono"> · {tx.item.hotel.code}</span>
                )}
              </span>
              <span className={`font-mono ${tx.quantity < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                {tx.quantity > 0 ? "+" : ""}
                {tx.quantity}
              </span>
            </li>
          ))}
          {activityQuery.data?.length === 0 && <p className="text-sm text-ink-500">No activity yet.</p>}
        </ul>
      </section>
    </div>
  );
}
