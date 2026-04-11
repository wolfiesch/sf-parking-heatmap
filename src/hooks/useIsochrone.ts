import { useState, useCallback } from "react";
import type { TransportMode, IsochroneOrigin, IsochroneState } from "../types";

interface UseIsochroneOptions {
  initialActive?: boolean;
  initialMode?: TransportMode;
  initialOrigin?: IsochroneOrigin | null;
  initialMaxMinutes?: number;
}

/**
 * Manages isochrone interaction state: active toggle, origin selection,
 * transport mode, and max travel time.
 */
export function useIsochrone(options: UseIsochroneOptions = {}) {
  const [isActive, setIsActive] = useState(options.initialActive ?? false);
  const [origin, setOriginState] = useState<IsochroneOrigin | null>(
    options.initialOrigin ?? null,
  );
  const [mode, setMode] = useState<TransportMode>(
    options.initialMode ?? "driving",
  );
  const [maxMinutes, setMaxMinutes] = useState(options.initialMaxMinutes ?? 20);

  const toggleActive = useCallback(() => {
    setIsActive((prev) => {
      if (prev) {
        setOriginState(null);
      }
      return !prev;
    });
  }, []);

  const setOrigin = useCallback(
    (lat: number, lng: number, grid: IsochroneOrigin[] | null) => {
      if (!grid || grid.length === 0) return;

      // Snap to nearest grid point using haversine approximation
      let bestDist = Infinity;
      let bestPoint: IsochroneOrigin = grid[0];

      for (const point of grid) {
        const dlat = point.lat - lat;
        const dlng = (point.lng - lng) * Math.cos((lat * Math.PI) / 180);
        const dist = dlat * dlat + dlng * dlng;
        if (dist < bestDist) {
          bestDist = dist;
          bestPoint = point;
        }
      }

      setOriginState(bestPoint);
      const snapDistKm = Math.sqrt(bestDist) * 111.32;
      return Math.round(snapDistKm * 1000);
    },
    [],
  );

  const clearOrigin = useCallback(() => {
    setOriginState(null);
  }, []);

  const state: IsochroneState = { isActive, origin, mode, maxMinutes };

  return {
    ...state,
    toggleActive,
    setOrigin,
    clearOrigin,
    setMode,
    setMaxMinutes,
  };
}
