import { ScatterplotLayer } from "deck.gl";
import type { BlockData, TimeSlot } from "../types";
import { occupancyToColor } from "../lib/colors";
import { getTimeSlotIndex, isEnforcedAt } from "../lib/occupancy";

/** Individual meter position with parent block reference */
interface MeterDot {
  position: [number, number];
  block: BlockData;
}

export function createMeterDotsLayer(
  blocks: BlockData[],
  timeSlot: TimeSlot,
) {
  const slotIdx = getTimeSlotIndex(timeSlot.dow, timeSlot.hour);

  // Flatten all meter positions with their parent block
  const dots: MeterDot[] = [];
  for (const block of blocks) {
    if (!block.meterPositions) continue;
    for (const pos of block.meterPositions) {
      dots.push({ position: pos, block });
    }
  }

  return new ScatterplotLayer<MeterDot>({
    id: "meter-dots",
    data: dots,
    getPosition: (d) => d.position,
    getFillColor: (d) =>
      occupancyToColor(d.block.slots[slotIdx], isEnforcedAt(d.block, slotIdx)),
    getLineColor: [255, 255, 255, 180],
    getRadius: 1.2,
    radiusUnits: "meters",
    radiusMinPixels: 3,
    radiusMaxPixels: 8,
    stroked: true,
    lineWidthMinPixels: 1,
    opacity: 1,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 120],
    updateTriggers: {
      getFillColor: [slotIdx],
    },
  });
}
