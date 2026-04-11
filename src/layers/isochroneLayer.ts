import { GeoJsonLayer, ScatterplotLayer } from "deck.gl";
import type { TransportMode, IsochroneOrigin, BlockData } from "../types";
import {
  CONTOUR_LEVELS,
  contourFillColor,
  contourStrokeColor,
  glowColor,
  originColors,
} from "../lib/isochroneColors";
import { pointInFeature } from "../lib/geo";

/**
 * Create deck.gl layers for isochrone visualization.
 *
 * Renders 10 contour bands (every 2 min from 2-20) largest-first for correct
 * stacking. Uses a rich color ramp with fading alpha for a smooth gradient
 * glow effect. Major contour lines (5, 10, 15, 20) get visible strokes.
 *
 * Also renders:
 * - An outer glow halo beyond the 20-min ring
 * - A dramatic origin marker with concentric rings
 */
export function createIsochroneLayers(
  contours: Record<string, GeoJSON.Feature> | null,
  mode: TransportMode,
  maxMinutes: number,
  origin: IsochroneOrigin | null,
  zoom?: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layers: any[] = [];
  if (!contours) return layers;

  // Zoom-adaptive band filtering: at low zoom show only major contours
  const majorOnly = zoom != null && zoom < 12;

  // Render bands largest-first (outermost under innermost)
  const visibleLevels = [...CONTOUR_LEVELS]
    .filter((m) => m <= maxMinutes)
    .filter((m) => !majorOnly || m % 5 === 0)
    .reverse();

  for (const minutes of visibleLevels) {
    const feature = contours[String(minutes)];
    if (!feature) continue;

    const bandIndex = CONTOUR_LEVELS.indexOf(minutes as typeof CONTOUR_LEVELS[number]);
    const fill = contourFillColor(mode, bandIndex);
    const stroke = contourStrokeColor(mode, minutes);
    const isMajor = minutes % 5 === 0;

    layers.push(
      new GeoJsonLayer({
        id: `isochrone-band-${minutes}`,
        data: { type: "FeatureCollection", features: [feature] },
        getFillColor: fill,
        getLineColor: stroke,
        getLineWidth: isMajor ? 1.5 : 0.5,
        lineWidthMinPixels: isMajor ? 1 : 0,
        stroked: true,
        filled: true,
        pickable: false,
        transitions: { getFillColor: 400, getLineColor: 400 },
      }),
    );
  }

  // Outer glow: a faint, larger version of the outermost ring
  const outerFeature = contours[String(maxMinutes)];
  if (outerFeature) {
    layers.unshift(
      new GeoJsonLayer({
        id: "isochrone-glow",
        data: { type: "FeatureCollection", features: [outerFeature] },
        getFillColor: glowColor(mode),
        getLineColor: [0, 0, 0, 0],
        stroked: false,
        filled: true,
        pickable: false,
      }),
    );
  }

  // Origin marker layers
  if (origin) {
    const colors = originColors(mode);

    // Outer pulse ring
    layers.push(
      new ScatterplotLayer({
        id: "iso-origin-pulse",
        data: [origin],
        getPosition: (d: IsochroneOrigin) => [d.lng, d.lat],
        getRadius: 120,
        getFillColor: colors.pulse,
        stroked: false,
        radiusUnits: "meters" as const,
        pickable: false,
      }),
    );

    // Mid glow ring
    layers.push(
      new ScatterplotLayer({
        id: "iso-origin-glow",
        data: [origin],
        getPosition: (d: IsochroneOrigin) => [d.lng, d.lat],
        getRadius: 60,
        getFillColor: colors.glow,
        stroked: false,
        radiusUnits: "meters" as const,
        pickable: false,
      }),
    );

    // Inner ring
    layers.push(
      new ScatterplotLayer({
        id: "iso-origin-ring",
        data: [origin],
        getPosition: (d: IsochroneOrigin) => [d.lng, d.lat],
        getRadius: 35,
        getFillColor: colors.ring,
        getLineColor: colors.dot,
        stroked: true,
        lineWidthMinPixels: 1.5,
        radiusUnits: "meters" as const,
        pickable: false,
      }),
    );

    // Core dot
    layers.push(
      new ScatterplotLayer({
        id: "iso-origin-dot",
        data: [origin],
        getPosition: (d: IsochroneOrigin) => [d.lng, d.lat],
        getRadius: 16,
        getFillColor: colors.dot,
        getLineColor: [255, 255, 255, 200],
        stroked: true,
        lineWidthMinPixels: 2,
        radiusUnits: "meters" as const,
        pickable: false,
      }),
    );
  }

  return layers;
}

/**
 * Create a highlight layer for parking blocks within the isochrone contour.
 * Renders a subtle white ring around reachable blocks to visually connect
 * the isochrone and parking data layers.
 */
export function createBlockHighlightLayer(
  blocks: BlockData[],
  contours: Record<string, GeoJSON.Feature> | null,
  maxMinutes: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | null {
  if (!contours || blocks.length === 0) return null;

  const outerFeature = contours[String(maxMinutes)];
  if (!outerFeature) return null;

  const reachableBlocks = blocks.filter((b) =>
    pointInFeature(b.lat, b.lng, outerFeature),
  );

  if (reachableBlocks.length === 0) return null;

  return new ScatterplotLayer({
    id: "iso-block-highlights",
    data: reachableBlocks,
    getPosition: (d: BlockData) => [d.lng, d.lat],
    getRadius: 18,
    getFillColor: [255, 255, 255, 0],
    getLineColor: [255, 255, 255, 60],
    stroked: true,
    filled: false,
    lineWidthMinPixels: 1,
    radiusUnits: "meters" as const,
    pickable: false,
    transitions: { getLineColor: 300 },
  });
}
