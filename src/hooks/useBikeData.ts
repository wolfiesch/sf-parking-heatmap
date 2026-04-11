import { useState, useCallback, useRef, useMemo } from "react";
import type { StationData, BikeWeekData } from "../types";

interface BikeDataState {
  loading: boolean;
  error: string | null;
  data: BikeWeekData | null;
}

/**
 * Lazy-loads bike share data from /data/bike_week.json.
 * Only fetches when bike or correlation mode is activated.
 * Caches after first load, pre-computes city-wide averages.
 */
export function useBikeData() {
  const [state, setState] = useState<BikeDataState>({
    loading: false,
    error: null,
    data: null,
  });
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (state.data || loadingRef.current) return;
    loadingRef.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const resp = await fetch("/data/bike_week.json");
      if (!resp.ok) throw new Error(`Failed to load bike data: ${resp.status}`);
      const json: BikeWeekData = await resp.json();

      setState({ loading: false, error: null, data: json });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      loadingRef.current = false;
    }
  }, [state.data]);

  const stations: StationData[] = state.data?.stations ?? [];

  const cityAverages = useMemo(() => {
    const avgs = new Float32Array(168);
    if (stations.length === 0) return avgs;
    for (let i = 0; i < 168; i++) {
      let sum = 0;
      let count = 0;
      for (const st of stations) {
        const v = st.slots[i];
        if (v > 0) {
          sum += v;
          count++;
        }
      }
      avgs[i] = count > 0 ? sum / count : 0;
    }
    return avgs;
  }, [stations]);

  return {
    loading: state.loading,
    error: state.error,
    stations,
    cityAverages,
    generated: state.data?.generated ?? null,
    dateRange: state.data?.dateRange ?? null,
    load,
  };
}
