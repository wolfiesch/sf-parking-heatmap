import { ScatterplotLayer } from "deck.gl";
import type { StationData, TimeSlot } from "../types";
import { getTimeSlotIndex } from "../lib/occupancy";
import { demandToColor } from "../lib/bikeColors";

export function createBikeScatterLayer(
  stations: StationData[],
  timeSlot: TimeSlot,
  selectedStationId: string | null,
) {
  const slotIdx = getTimeSlotIndex(timeSlot.dow, timeSlot.hour);

  return new ScatterplotLayer<StationData>({
    id: "bike-scatter",
    data: stations,
    getPosition: (d) => [d.lng, d.lat],
    getFillColor: (d) => demandToColor(d.slots[slotIdx] ?? 0),
    getLineColor: (d) =>
      d.id === selectedStationId ? [255, 255, 255, 255] : [0, 0, 0, 0],
    getLineWidth: (d) => (d.id === selectedStationId ? 2 : 0),
    getRadius: (d) => 12 + (d.capacity ?? 0) * 0.8,
    radiusMinPixels: 4,
    radiusMaxPixels: 40,
    stroked: true,
    lineWidthMinPixels: 0,
    opacity: 0.95,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 60],
    transitions: { getFillColor: 300 },
    updateTriggers: {
      getFillColor: [slotIdx],
      getLineColor: [selectedStationId],
      getLineWidth: [selectedStationId],
    },
  });
}
