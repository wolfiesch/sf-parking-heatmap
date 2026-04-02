import { PathLayer } from "deck.gl";
import type { Layer } from "deck.gl";
import type { BlockData, TimeSlot } from "../types";
import { occupancyToColor } from "../lib/colors";
import { getTimeSlotIndex, isEnforcedAt } from "../lib/occupancy";
import { createParkingScatterLayer } from "./parkingScatterLayer";

export function createParkingPathLayers(
  withPath: BlockData[],
  withoutPath: BlockData[],
  timeSlot: TimeSlot,
  selectedBlockId: string | null,
): Layer[] {
  const slotIdx = getTimeSlotIndex(timeSlot.dow, timeSlot.hour);
  const selectedBlock = selectedBlockId
    ? withPath.find((b) => b.id === selectedBlockId)
    : undefined;

  const layers: Layer[] = [];

  // Selection halo (white, wider, underneath)
  if (selectedBlock) {
    layers.push(
      new PathLayer<BlockData>({
        id: "parking-paths-selection",
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
      id: "parking-paths-outline",
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

  // Main path layer
  layers.push(
    new PathLayer<BlockData>({
      id: "parking-paths",
      data: withPath,
      getPath: (d) => d.path!,
      getColor: (d) =>
        occupancyToColor(d.slots[slotIdx], isEnforcedAt(d, slotIdx)),
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
        getColor: [slotIdx],
      },
    }),
  );

  // Fallback scatter for pathless blocks (single-meter blocks)
  if (withoutPath.length > 0) {
    layers.push(createParkingScatterLayer(withoutPath, timeSlot, selectedBlockId));
  }

  return layers;
}
