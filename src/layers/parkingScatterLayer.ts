import { ScatterplotLayer } from "deck.gl";
import type { BlockData, TimeSlot } from "../types";
import { occupancyToColor } from "../lib/colors";
import { getTimeSlotIndex, isEnforcedAt } from "../lib/occupancy";

export function createParkingScatterLayer(
  blocks: BlockData[],
  timeSlot: TimeSlot,
  selectedBlockId: string | null,
) {
  const slotIdx = getTimeSlotIndex(timeSlot.dow, timeSlot.hour);

  return new ScatterplotLayer<BlockData>({
    id: "parking-scatter",
    data: blocks,
    getPosition: (d) => [d.lng, d.lat],
    getFillColor: (d) => occupancyToColor(d.slots[slotIdx], isEnforcedAt(d, slotIdx)),
    getRadius: (d) => 20 + d.meters * 3,
    getLineColor: (d) =>
      d.id === selectedBlockId
        ? [255, 255, 255, 255]
        : [0, 0, 0, 0],
    getLineWidth: (d) => (d.id === selectedBlockId ? 2 : 0),
    stroked: true,
    radiusMinPixels: 4,
    radiusMaxPixels: 30,
    opacity: 0.85,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 80],
    updateTriggers: {
      getFillColor: [slotIdx],
      getLineColor: [selectedBlockId],
      getLineWidth: [selectedBlockId],
    },
  });
}
