import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import { Hotel } from "../types";
import { useAuth } from "./AuthContext";

interface HotelScopeValue {
  hotels: Hotel[];
  selectedHotelId: string;
  setSelectedHotelId: (id: string) => void;
  canSwitchHotels: boolean;
}

const HotelScopeContext = createContext<HotelScopeValue | undefined>(undefined);

export function HotelScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");

  const canSwitchHotels = user?.role === "ADMIN";

  useEffect(() => {
    if (!user) return;
    api.get<Hotel[]>("/hotels").then((data) => {
      setHotels(data);
      if (!canSwitchHotels && user.hotelId) {
        setSelectedHotelId(user.hotelId);
      } else if (canSwitchHotels && data.length > 0 && !selectedHotelId) {
        setSelectedHotelId(data[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <HotelScopeContext.Provider value={{ hotels, selectedHotelId, setSelectedHotelId, canSwitchHotels }}>
      {children}
    </HotelScopeContext.Provider>
  );
}

export function useHotelScope() {
  const ctx = useContext(HotelScopeContext);
  if (!ctx) throw new Error("useHotelScope must be used within HotelScopeProvider");
  return ctx;
}
