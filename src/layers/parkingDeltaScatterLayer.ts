import { ScatterplotLayer } from "deck.gl";
import type { BlockData, TimeSlot } from "../types";
import { deltaToColor } from "../lib/deltaColors";
import { getTimeSlotIndex } from "../lib/occupancy";

export function createParkingDeltaScatterLayer(
  blocks: BlockData[],
  currentSlot: TimeSlot,
  referenceSlot: TimeSlot,
  selectedBlockId: string | null,
) {
  const curIdx = getTimeSlotIndex(currentSlot.dow, currentSlot.hour);
  const refIdx = getTimeSlotIndex(referenceSlot.dow, referenceSlot.hour);

  return new ScatterplotLayer<BlockData>({
    id: "parking-delta-scatter",
    data: blocks,
    getPosition: (d) => [d.lng, d.lat],
    getFillColor: (d) => {
      const curOcc = d.slots[curIdx] ?? 0;
      const refOcc = d.slots[refIdx] ?? 0;
      const hasData = curOcc > 0 || refOcc > 0;
      return deltaToColor(curOcc - refOcc, hasData);
    },
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
      getFillColor: [curIdx, refIdx],
      getLineColor: [selectedBlockId],
      getLineWidth: [selectedBlockId],
    },
  });
}
