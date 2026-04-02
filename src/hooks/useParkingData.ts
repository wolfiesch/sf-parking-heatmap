import { useState, useEffect, useMemo } from "react";
import type { BlockData, ParkingWeekData, TimeSlot } from "../types";
import { computeAllCityAverages, getTimeSlotIndex } from "../lib/occupancy";

/** Compute fraction of blocks enforced per slot (168 values, 0-1) */
function computeEnforcedFraction(blocks: BlockData[]): Float32Array {
  const fracs = new Float32Array(168);
  if (blocks.length === 0) return fracs;
  for (let i = 0; i < 168; i++) {
    let enforced = 0;
    for (const block of blocks) {
      if (!block.enforced || block.enforced[i] === 1) enforced++;
    }
    fracs[i] = enforced / blocks.length;
  }
  return fracs;
}

interface ParkingDataState {
  blocks: BlockData[];
  cityAverages: Float32Array;
  cityEnforcedFraction: Float32Array;
  loading: boolean;
  error: string | null;
  generated: string | null;
  dateRange: { from: string; to: string } | null;
}

export function useParkingData() {
  const [state, setState] = useState<ParkingDataState>({
    blocks: [],
    cityAverages: new Float32Array(168),
    cityEnforcedFraction: new Float32Array(168).fill(1),
    loading: true,
    error: null,
    generated: null,
    dateRange: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/data/parking_week.json");
        if (!res.ok) throw new Error(`Failed to load parking data: ${res.status}`);

        const data: ParkingWeekData = await res.json();

        if (cancelled) return;

        const cityAverages = computeAllCityAverages(data.blocks);
        const cityEnforcedFraction = computeEnforcedFraction(data.blocks);

        setState({
          blocks: data.blocks,
          cityAverages,
          cityEnforcedFraction,
          loading: false,
          error: null,
          generated: data.generated,
          dateRange: data.dateRange,
        });
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const neighborhoods = useMemo(() => {
    const set = new Set<string>();
    for (const block of state.blocks) {
      // Extract neighborhood from street name if available
      if (block.street) set.add(block.street);
    }
    return Array.from(set).sort();
  }, [state.blocks]);

  const getCityAverage = (slot: TimeSlot): number => {
    return state.cityAverages[getTimeSlotIndex(slot.dow, slot.hour)];
  };

  return {
    ...state,
    neighborhoods,
    getCityAverage,
  };
}
