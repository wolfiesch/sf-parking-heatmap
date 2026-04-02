import { PathLayer } from "deck.gl";
import type { Layer } from "deck.gl";
import type { BlockData, TimeSlot } from "../types";
import { deltaToColor } from "../lib/deltaColors";
import { getTimeSlotIndex } from "../lib/occupancy";
import { createParkingDeltaScatterLayer } from "./parkingDeltaScatterLayer";

export function createParkingDeltaPathLayers(
  withPath: BlockData[],
  withoutPath: BlockData[],
  currentSlot: TimeSlot,
  referenceSlot: TimeSlot,
  selectedBlockId: string | null,
): Layer[] {
  const curIdx = getTimeSlotIndex(currentSlot.dow, currentSlot.hour);
  const refIdx = getTimeSlotIndex(referenceSlot.dow, referenceSlot.hour);
  const selectedBlock = selectedBlockId
    ? withPath.find((b) => b.id === selectedBlockId)
    : undefined;

  const layers: Layer[] = [];

  // Selection halo
  if (selectedBlock) {
    layers.push(
      new PathLayer<BlockData>({
        id: "parking-delta-paths-selection",
        data: [selectedBlock],
        getPath: (d) => d.path!,
        getColor: [255, 255, 255, 255],
        getWidth: 12,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        pickable: false,
      }),
    );
  }

  // Dark outline underneath for contrast
  layers.push(
    new PathLayer<BlockData>({
      id: "parking-delta-paths-outline",
      data: withPath,
      getPath: (d) => d.path!,
      getColor: [0, 0, 0, 200],
      getWidth: 10,
      widthUnits: "pixels",
      widthMinPixels: 7,
      widthMaxPixels: 18,
      capRounded: true,
      jointRounded: true,
      pickable: false,
    }),
  );

  // Main delta path layer
  layers.push(
    new PathLayer<BlockData>({
      id: "parking-delta-paths",
      data: withPath,
      getPath: (d) => d.path!,
      getColor: (d) => {
        const curOcc = d.slots[curIdx] ?? 0;
        const refOcc = d.slots[refIdx] ?? 0;
        const hasData = curOcc > 0 || refOcc > 0;
        return deltaToColor(curOcc - refOcc, hasData);
      },
      getWidth: 8,
      widthUnits: "pixels",
      widthMinPixels: 5,
      widthMaxPixels: 16,
      capRounded: true,
      jointRounded: true,
      opacity: 1,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 80],
      updateTriggers: {
        getColor: [curIdx, refIdx],
      },
    }),
  );

  // Fallback scatter for pathless blocks
  if (withoutPath.length > 0) {
    layers.push(
      createParkingDeltaScatterLayer(withoutPath, currentSlot, referenceSlot, selectedBlockId),
    );
  }

  return layers;
}
