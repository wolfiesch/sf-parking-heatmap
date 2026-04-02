import { useState, useCallback, useRef } from "react";
import { FlyToInterpolator } from "deck.gl";
import type { MapViewState } from "deck.gl";

const DEFAULT_VIEW: MapViewState = {
  longitude: -122.42,
  latitude: 37.775,
  zoom: 13,
  pitch: 0,
  bearing: 0,
};

// Zoom tier boundaries (matching ParkingMap)
const COLUMN_ZOOM_MIN = 13;
const SCATTER_ZOOM_MIN = 15.5;

type ZoomTier = "heatmap" | "columns" | "scatter";

function getZoomTier(zoom: number): ZoomTier {
  if (zoom >= SCATTER_ZOOM_MIN) return "scatter";
  if (zoom >= COLUMN_ZOOM_MIN) return "columns";
  return "heatmap";
}

export function useMapView(initialOverrides?: Partial<MapViewState>) {
  const [viewState, setViewState] = useState<MapViewState>({
    ...DEFAULT_VIEW,
    ...initialOverrides,
  });

  // Track previous zoom tier for auto-pitch on tier crossing
  const prevTierRef = useRef<ZoomTier>(getZoomTier(viewState.zoom));
  // Track whether user has manually set pitch in column tier
  const userPitchRef = useRef(false);

  const flyTo = useCallback((longitude: number, latitude: number, zoom?: number) => {
    setViewState((prev) => ({
      ...prev,
      longitude,
      latitude,
      zoom: zoom ?? Math.max(prev.zoom, 15),
      transitionDuration: 1000,
      transitionInterpolator: new FlyToInterpolator(),
    }));
  }, []);

  const onViewStateChange = useCallback((vs: MapViewState) => {
    const newTier = getZoomTier(vs.zoom);
    const prevTier = prevTierRef.current;

    // Auto-pitch when entering column tier from heatmap
    if (newTier === "columns" && prevTier === "heatmap" && !userPitchRef.current) {
      vs = { ...vs, pitch: 45 };
    }
    // Reset pitch when leaving column tier to heatmap
    if (newTier === "heatmap" && prevTier === "columns") {
      vs = { ...vs, pitch: 0 };
      userPitchRef.current = false;
    }

    // Detect manual pitch adjustment while in column tier
    if (newTier === "columns" && prevTier === "columns") {
      userPitchRef.current = true;
    }

    prevTierRef.current = newTier;
    setViewState(vs);
  }, []);

  return {
    viewState,
    setViewState,
    onViewStateChange,
    flyTo,
  };
}
