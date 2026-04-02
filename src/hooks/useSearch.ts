import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { BlockData, TimeSlot } from "../types";
import { geocode, haversineMeters, type GeoResult } from "../lib/geocode";
import { getTimeSlotIndex } from "../lib/occupancy";

const RADIUS_OPTIONS = [200, 400, 600, 800] as const;
export type RadiusOption = (typeof RADIUS_OPTIONS)[number];
export { RADIUS_OPTIONS };

export interface SearchState {
  query: string;
  results: GeoResult[];
  selectedResult: GeoResult | null;
  radius: RadiusOption;
  isSearching: boolean;
  nearbyBlocks: BlockData[];
}

export function useSearch(blocks: BlockData[], timeSlot: TimeSlot) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<GeoResult | null>(null);
  const [radius, setRadius] = useState<RadiusOption>(400);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Debounced geocoding
  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current != null) clearTimeout(debounceRef.current);

    if (q.trim().length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      const r = await geocode(q);
      setResults(r);
      setIsSearching(false);
    }, 300);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
    };
  }, []);

  // Blocks within radius of selected result, sorted by occupancy (lowest first)
  const nearbyBlocks = useMemo(() => {
    if (!selectedResult) return [];
    const slotIdx = getTimeSlotIndex(timeSlot.dow, timeSlot.hour);
    return blocks
      .filter((b) => {
        const dist = haversineMeters(selectedResult.lat, selectedResult.lng, b.lat, b.lng);
        return dist <= radius;
      })
      .sort((a, b) => (a.slots[slotIdx] ?? 0) - (b.slots[slotIdx] ?? 0))
      .slice(0, 15);
  }, [selectedResult, radius, blocks, timeSlot]);

  const selectResult = useCallback((result: GeoResult) => {
    setSelectedResult(result);
    setResults([]);
    setQuery(result.name);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    setSelectedResult(null);
  }, []);

  return {
    query,
    results,
    selectedResult,
    radius,
    isSearching,
    nearbyBlocks,
    setQuery: handleQueryChange,
    setRadius,
    selectResult,
    clearSearch,
  };
}
