import { HeatmapLayer } from "deck.gl";
import type { BlockData, TimeSlot } from "../types";
import { getTimeSlotIndex } from "../lib/occupancy";

export function createParkingHeatmapLayer(
  blocks: BlockData[],
  timeSlot: TimeSlot,
) {
  const slotIdx = getTimeSlotIndex(timeSlot.dow, timeSlot.hour);

  return new HeatmapLayer<BlockData>({
    id: "parking-heatmap",
    data: blocks,
    getPosition: (d) => [d.lng, d.lat],
    getWeight: (d) => d.slots[slotIdx] ?? 0,
    radiusPixels: 40,
    intensity: 1.5,
    threshold: 0.1,
    colorRange: [
      [34, 197, 94, 60],   // green (low occupancy)
      [34, 197, 94, 120],
      [234, 179, 8, 160],  // yellow
      [239, 68, 68, 180],  // red (high occupancy)
      [239, 68, 68, 220],
      [180, 20, 20, 255],  // deep red
    ],
    updateTriggers: {
      getWeight: [slotIdx],
    },
  });
}
