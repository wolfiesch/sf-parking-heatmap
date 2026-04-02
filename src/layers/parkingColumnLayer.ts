import { ColumnLayer, PolygonLayer, ScatterplotLayer } from "deck.gl";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import type { Layer } from "deck.gl";
import type { BlockData, TimeSlot } from "../types";
import { occupancyToColor } from "../lib/colors";
import { getTimeSlotIndex, isEnforcedAt } from "../lib/occupancy";

export type ColumnStyle = "hexgrid" | "columns" | "bars";

/** Buffer a 2-point path into a 4-vertex rectangle polygon */
function blockPathToRect(
  path: [number, number][],
  halfWidthMeters: number,
): [number, number][] {
  const [p0, p1] = path;
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return [p0, p0, p0, p0];
  const meterToDeg = 1 / 111320 / Math.cos((p0[1] * Math.PI) / 180);
  const nx = (-dy / len) * halfWidthMeters * meterToDeg;
  const ny = (dx / len) * halfWidthMeters * meterToDeg;
  return [
    [p0[0] - nx, p0[1] - ny],
    [p0[0] + nx, p0[1] + ny],
    [p1[0] + nx, p1[1] + ny],
    [p1[0] - nx, p1[1] - ny],
  ];
}

function createHexGridLayer(blocks: BlockData[], slotIdx: number): Layer[] {
  return [
    new HexagonLayer<BlockData>({
      id: `parking-hexgrid-${slotIdx}`,
      data: blocks,
      getPosition: (d) => [d.lng, d.lat],
      getColorWeight: (d) => d.slots[slotIdx] ?? 0,
      colorAggregation: "MEAN",
      getElevationWeight: (d) => d.slots[slotIdx] ?? 0,
      elevationAggregation: "MEAN",
      radius: 20,
      extruded: true,
      elevationScale: 1,
      elevationDomain: [0, 1],
      elevationRange: [0, 80],
      colorRange: [
        [34, 197, 94],   // 0%  - green
        [34, 197, 94],   // 20% - green
        [34, 197, 94],   // 40% - green (still available)
        [234, 179, 8],   // 60% - yellow (moderate)
        [239, 68, 68],   // 80% - red (difficult)
        [180, 20, 20],   // 100% - deep red
      ],
      colorDomain: [0, 1],
      coverage: 0.85,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      material: { ambient: 0.5, diffuse: 0.8, shininess: 20 },
      updateTriggers: {
        getColorWeight: [slotIdx],
        getElevationWeight: [slotIdx],
      },
    }) as unknown as Layer,
  ];
}

function createTunedColumnLayer(
  blocks: BlockData[],
  slotIdx: number,
  selectedBlockId: string | null,
): Layer[] {
  return [
    new ColumnLayer<BlockData>({
      id: "parking-columns",
      data: blocks,
      getPosition: (d) => [d.lng, d.lat],
      getFillColor: (d) => occupancyToColor(d.slots[slotIdx], isEnforcedAt(d, slotIdx)),
      getElevation: (d) => {
        const occ = d.slots[slotIdx];
        return occ > 0 ? occ * 500 : 80;
      },
      getLineColor: (d) =>
        d.id === selectedBlockId ? [255, 255, 255, 255] : [0, 0, 0, 0],
      getLineWidth: (d) => (d.id === selectedBlockId ? 2 : 0),
      diskResolution: 12,
      radius: 50,
      extruded: true,
      stroked: true,
      opacity: 0.95,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      material: { ambient: 0.6, diffuse: 0.8, shininess: 20 },
      transitions: { getElevation: 300, getFillColor: 300 },
      updateTriggers: {
        getFillColor: [slotIdx],
        getElevation: [slotIdx],
        getLineColor: [selectedBlockId],
        getLineWidth: [selectedBlockId],
      },
    }),
  ];
}

function createStreetBarsLayer(
  blocks: BlockData[],
  slotIdx: number,
): Layer[] {
  const withPath = blocks.filter((b) => b.path && b.path.length >= 2);
  const withoutPath = blocks.filter((b) => !b.path || b.path.length < 2);

  const layers: Layer[] = [];

  layers.push(
    new PolygonLayer<BlockData>({
      id: "parking-bars",
      data: withPath,
      getPolygon: (d) => blockPathToRect(d.path!, 8),
      getFillColor: (d) => occupancyToColor(d.slots[slotIdx], isEnforcedAt(d, slotIdx)),
      getElevation: (d) => {
        const occ = d.slots[slotIdx];
        return occ > 0 ? occ * 500 : 10;
      },
      extruded: true,
      wireframe: false,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      material: { ambient: 0.5, diffuse: 0.8, shininess: 30 },
      transitions: { getElevation: 300, getFillColor: 300 },
      updateTriggers: { getFillColor: [slotIdx], getElevation: [slotIdx] },
    }),
  );

  if (withoutPath.length > 0) {
    layers.push(
      new ScatterplotLayer<BlockData>({
        id: "parking-bars-fallback",
        data: withoutPath,
        getPosition: (d) => [d.lng, d.lat],
        getFillColor: (d) => occupancyToColor(d.slots[slotIdx], isEnforcedAt(d, slotIdx)),
        getRadius: 15,
        radiusMinPixels: 3,
        radiusMaxPixels: 15,
        opacity: 0.9,
        pickable: true,
        updateTriggers: { getFillColor: [slotIdx] },
      }),
    );
  }

  return layers;
}

export function createParkingColumnLayer(
  blocks: BlockData[],
  timeSlot: TimeSlot,
  selectedBlockId: string | null,
  style: ColumnStyle = "hexgrid",
): Layer[] {
  const slotIdx = getTimeSlotIndex(timeSlot.dow, timeSlot.hour);

  switch (style) {
    case "columns":
      return createTunedColumnLayer(blocks, slotIdx, selectedBlockId);
    case "bars":
      return createStreetBarsLayer(blocks, slotIdx);
    case "hexgrid":
    default:
      return createHexGridLayer(blocks, slotIdx);
  }
}
