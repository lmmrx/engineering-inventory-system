import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Hotel } from "../types";
import { useAuth } from "./AuthContext";

// Sentinel for "no single hotel — show everything an Admin can see."
// Distinct from the initial "" state (hotels not loaded yet) so query hooks
// can tell "not ready" apart from "deliberately viewing all hotels."
export const ALL_HOTELS = "__all__";

interface HotelScopeValue {
  hotels: Hotel[];
  selectedHotelId: string;
  setSelectedHotelId: (id: string) => void;
  canSwitchHotels: boolean;
}

const HotelScopeContext = createContext<HotelScopeValue | undefined>(undefined);

export function HotelScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const canSwitchHotels = user?.role === "ADMIN";
  // Shared with every other page that lists hotels, so it's fetched once.
  const { data: hotels = [] } = useQuery({
    queryKey: ["hotels"],
    queryFn: () => api.get<Hotel[]>("/hotels"),
    enabled: !!user,
  });
  const [chosen, setChosen] = useState("");

  // Admins start on the first hotel; everyone else is always on their own.
  useEffect(() => {
    if (canSwitchHotels && !chosen && hotels.length > 0) setChosen(hotels[0].id);
  }, [canSwitchHotels, chosen, hotels]);

  const selectedHotelId = canSwitchHotels ? chosen : user?.hotelId ?? "";

  return (
    <HotelScopeContext.Provider value={{ hotels, selectedHotelId, setSelectedHotelId: setChosen, canSwitchHotels }}>
      {children}
    </HotelScopeContext.Provider>
  );
}

export function useHotelScope() {
  const ctx = useContext(HotelScopeContext);
  if (!ctx) throw new Error("useHotelScope must be used within HotelScopeProvider");
  return ctx;
}
