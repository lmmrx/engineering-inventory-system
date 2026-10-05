import { useEffect, useState } from "react";

// True once `active` has stayed true for `ms`. Used to explain a slow wait
// (the free-tier API waking up) instead of leaving a silent spinner.
export function useTakingLong(active: boolean, ms = 5000) {
  const [takingLong, setTakingLong] = useState(false);

  useEffect(() => {
    if (!active) {
      setTakingLong(false);
      return;
    }
    const timer = setTimeout(() => setTakingLong(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);

  return takingLong;
}
