import { HeatmapLayer } from "deck.gl";
import type { StationData, TimeSlot } from "../types";
import { getTimeSlotIndex } from "../lib/occupancy";

export function createBikeHeatmapLayer(
  stations: StationData[],
  timeSlot: TimeSlot,
) {
  const slotIdx = getTimeSlotIndex(timeSlot.dow, timeSlot.hour);

  return new HeatmapLayer<StationData>({
    id: "bike-heatmap",
    data: stations,
    getPosition: (d) => [d.lng, d.lat],
    getWeight: (d) => d.slots[slotIdx] ?? 0,
    radiusPixels: 50,
    intensity: 1.5,
    threshold: 0.08,
    colorRange: [
      [94, 234, 212, 60],   // light teal (low demand)
      [94, 234, 212, 120],
      [20, 184, 166, 160],  // teal
      [15, 118, 110, 180],  // deep teal
      [8, 75, 82, 220],     // dark cyan
      [6, 55, 65, 255],     // deepest
    ],
    updateTriggers: {
      getWeight: [slotIdx],
    },
  });
}
