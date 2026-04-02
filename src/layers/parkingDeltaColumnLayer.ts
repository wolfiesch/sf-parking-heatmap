import { ColumnLayer } from "deck.gl";
import type { BlockData, TimeSlot } from "../types";
import { deltaToColor } from "../lib/deltaColors";
import { getTimeSlotIndex } from "../lib/occupancy";

export function createParkingDeltaColumnLayer(
  blocks: BlockData[],
  currentSlot: TimeSlot,
  referenceSlot: TimeSlot,
  selectedBlockId: string | null,
) {
  const curIdx = getTimeSlotIndex(currentSlot.dow, currentSlot.hour);
  const refIdx = getTimeSlotIndex(referenceSlot.dow, referenceSlot.hour);

  return new ColumnLayer<BlockData>({
    id: "parking-delta-columns",
    data: blocks,
    getPosition: (d) => [d.lng, d.lat],
    getFillColor: (d) => {
      const curOcc = d.slots[curIdx] ?? 0;
      const refOcc = d.slots[refIdx] ?? 0;
      const hasData = curOcc > 0 || refOcc > 0;
      return deltaToColor(curOcc - refOcc, hasData);
    },
    getElevation: (d) => {
      const curOcc = d.slots[curIdx] ?? 0;
      const refOcc = d.slots[refIdx] ?? 0;
      const delta = Math.abs(curOcc - refOcc);
      return delta > 0 ? delta * 1500 : 10; // height encodes magnitude
    },
    getLineColor: (d) =>
      d.id === selectedBlockId
        ? [255, 255, 255, 255]
        : [0, 0, 0, 0],
    getLineWidth: (d) => (d.id === selectedBlockId ? 2 : 0),
    diskResolution: 6,
    radius: 25,
    extruded: true,
    stroked: true,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 60],
    transitions: {
      getElevation: 300,
      getFillColor: 300,
    },
    updateTriggers: {
      getFillColor: [curIdx, refIdx],
      getElevation: [curIdx, refIdx],
      getLineColor: [selectedBlockId],
      getLineWidth: [selectedBlockId],
    },
  });
}
