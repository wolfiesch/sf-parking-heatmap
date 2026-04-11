import { ScatterplotLayer } from "deck.gl";
import type { BlockData, StationData, TimeSlot } from "../types";
import { getTimeSlotIndex } from "../lib/occupancy";
import { correlationToColor } from "../lib/bikeColors";

/** Haversine distance in meters */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Pre-compute nearest station(s) within radius for each parking block */
export function buildNearestStationMap(
  blocks: BlockData[],
  stations: StationData[],
  radiusMeters = 400,
): Map<string, StationData[]> {
  const map = new Map<string, StationData[]>();

  for (const block of blocks) {
    const nearby: StationData[] = [];
    for (const station of stations) {
      const dist = haversineM(block.lat, block.lng, station.lat, station.lng);
      if (dist <= radiusMeters) {
        nearby.push(station);
      }
    }
    if (nearby.length > 0) {
      map.set(block.id, nearby);
    }
  }

  return map;
}

/** Average bike demand from nearby stations for a given slot */
function avgBikeDemand(stations: StationData[], slotIdx: number): number {
  if (stations.length === 0) return 0;
  let sum = 0;
  for (const s of stations) {
    sum += s.slots[slotIdx] ?? 0;
  }
  return sum / stations.length;
}

export function createCorrelationLayer(
  blocks: BlockData[],
  timeSlot: TimeSlot,
  nearestStations: Map<string, StationData[]>,
) {
  const slotIdx = getTimeSlotIndex(timeSlot.dow, timeSlot.hour);

  // Filter to only blocks that have nearby stations
  const blocksWithStations = blocks.filter((b) => nearestStations.has(b.id));

  return new ScatterplotLayer<BlockData>({
    id: "correlation-overlay",
    data: blocksWithStations,
    getPosition: (d) => [d.lng, d.lat],
    getFillColor: (d) => {
      const parkingOcc = d.slots[slotIdx] ?? 0;
      const nearby = nearestStations.get(d.id);
      const bikeDemand = nearby ? avgBikeDemand(nearby, slotIdx) : 0;
      return correlationToColor(parkingOcc, bikeDemand);
    },
    getRadius: 30,
    radiusMinPixels: 3,
    radiusMaxPixels: 30,
    opacity: 0.85,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 60],
    transitions: { getFillColor: 300 },
    updateTriggers: {
      getFillColor: [slotIdx],
    },
  });
}
