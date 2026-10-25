import { useCallback } from "react";
import { ALL_HOTELS, useHotelScope } from "../context/HotelScopeContext";
import { useDepartmentScope } from "../context/DepartmentScopeContext";

/**
 * The hotel and department the user is looking at, and the query string that
 * asks the server for exactly that — shared by every page that lists data.
 */
export function useScope() {
  const { selectedHotelId } = useHotelScope();
  const { selectedDepartmentId } = useDepartmentScope();
  const viewingAllHotels = selectedHotelId === ALL_HOTELS;

  /** e.g. "departmentId=…&hotelId=…&lowStockOnly=true" (no hotelId when viewing all hotels). */
  const params = useCallback(
    (extra?: Record<string, string>) => {
      const query = new URLSearchParams({ departmentId: selectedDepartmentId, ...extra });
      if (!viewingAllHotels) query.set("hotelId", selectedHotelId);
      return query.toString();
    },
    [selectedHotelId, selectedDepartmentId, viewingAllHotels]
  );

  return {
    selectedHotelId,
    selectedDepartmentId,
    viewingAllHotels,
    /** Both are known (they load after sign-in), so queries can run. */
    ready: !!selectedHotelId && !!selectedDepartmentId,
    params,
  };
}

/** The reader's time zone, so the server counts days the way they do. */
export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
