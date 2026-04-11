import { useState, useCallback, useRef } from "react";
import type { TransportMode, IsochroneSet } from "../types";

interface IsochroneDataState {
  loading: boolean;
  error: string | null;
  data: Partial<Record<TransportMode, IsochroneSet>>;
}

/**
 * Lazy-loads isochrone JSON files per transport mode.
 * Only fetches when isochrone mode is activated and a mode is selected.
 * Caches loaded modes for instant switching.
 */
export function useIsochroneData() {
  const [state, setState] = useState<IsochroneDataState>({
    loading: false,
    error: null,
    data: {},
  });
  const loadingRef = useRef<Set<TransportMode>>(new Set());

  const loadMode = useCallback(async (mode: TransportMode) => {
    // Already loaded or in-flight
    if (state.data[mode] || loadingRef.current.has(mode)) return;

    loadingRef.current.add(mode);
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const resp = await fetch(`/data/isochrones/${mode}.json`);
      if (!resp.ok) throw new Error(`Failed to load ${mode} isochrones: ${resp.status}`);
      const json: IsochroneSet = await resp.json();

      setState((s) => ({
        ...s,
        loading: false,
        data: { ...s.data, [mode]: json },
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      loadingRef.current.delete(mode);
    }
  }, [state.data]);

  const getIsochrones = useCallback(
    (mode: TransportMode, gridPointId: number, profileIndex: number) => {
      const modeData = state.data[mode];
      if (!modeData) return null;

      const pointData = modeData.isochrones[String(gridPointId)];
      if (!pointData) return null;

      return pointData[String(profileIndex)] ?? null;
    },
    [state.data],
  );

  const getProfileIndex = useCallback(
    (mode: TransportMode, dow: number, hour: number): number => {
      const modeData = state.data[mode];
      if (!modeData) return 3; // default to night (free flow)
      const slotIndex = dow * 24 + hour;
      return modeData.profileMap[slotIndex] ?? 3;
    },
    [state.data],
  );

  const getGrid = useCallback(
    (mode: TransportMode) => {
      return state.data[mode]?.grid ?? null;
    },
    [state.data],
  );

  return {
    loading: state.loading,
    error: state.error,
    loadMode,
    getIsochrones,
    getProfileIndex,
    getGrid,
  };
}
