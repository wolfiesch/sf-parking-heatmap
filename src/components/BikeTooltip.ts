import type { StationData, BlockData, TimeSlot } from "../types";
import { getTimeSlotIndex } from "../lib/occupancy";
import { demandLabel } from "../lib/bikeColors";
import { dayName, formatHour } from "../lib/format";

/** Tooltip content for a hovered bike station */
export function getStationTooltipContent(station: StationData, timeSlot: TimeSlot) {
  const slotIdx = getTimeSlotIndex(timeSlot.dow, timeSlot.hour);
  const demand = station.slots[slotIdx] ?? 0;
  const arrivals = station.arrivals[slotIdx] ?? 0;
  const label = demandLabel(demand);
  const depPct = Math.round(demand * 100);
  const arrPct = Math.round(arrivals * 100);

  const labelColor =
    demand <= 0.3 ? "#5eead4" : demand <= 0.6 ? "#14b8a6" : "#0f766e";

  return {
    html: `
      <div style="min-width: 160px">
        <div style="font-weight: 600; margin-bottom: 3px">${station.name}</div>
        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px">${station.id} - ${station.capacity} docks</div>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 12px">${dayName(timeSlot.dow)} ${formatHour(timeSlot.hour)}</span>
          <span style="font-weight: 600; font-size: 14px">${demand > 0 ? depPct + "%" : "N/A"}</span>
        </div>
        <div style="font-size: 11px; color: ${labelColor}">${label} departures</div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px">Arrivals: ${arrivals > 0 ? arrPct + "%" : "N/A"}</div>
      </div>
    `,
  };
}

/** Tooltip content for correlation mode (parking block with bike context) */
export function getCorrelationTooltipContent(
  block: BlockData,
  nearbyStations: StationData[] | undefined,
  timeSlot: TimeSlot,
) {
  const slotIdx = getTimeSlotIndex(timeSlot.dow, timeSlot.hour);
  const parkingOcc = block.slots[slotIdx] ?? 0;
  const parkingPct = Math.round(parkingOcc * 100);

  let bikeDemand = 0;
  let stationCount = 0;
  if (nearbyStations && nearbyStations.length > 0) {
    stationCount = nearbyStations.length;
    let sum = 0;
    for (const s of nearbyStations) {
      sum += s.slots[slotIdx] ?? 0;
    }
    bikeDemand = sum / nearbyStations.length;
  }
  const bikePct = Math.round(bikeDemand * 100);
  const score = parkingOcc * (1 - bikeDemand);
  const advice =
    score >= 0.4 ? "Consider biking!" : score >= 0.2 ? "Bikes may help" : "No strong advantage";

  const adviceColor = score >= 0.4 ? "#22c55e" : score >= 0.2 ? "#94a3b8" : "#6b7280";

  return {
    html: `
      <div style="min-width: 170px">
        <div style="font-weight: 600; margin-bottom: 3px">${block.id}</div>
        ${block.hood ? `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px">${block.hood}</div>` : ""}
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px">
          <span style="font-size: 11px; color: #94a3b8">Parking:</span>
          <span style="font-size: 12px; font-weight: 500">${parkingOcc > 0 ? parkingPct + "%" : "N/A"}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px">
          <span style="font-size: 11px; color: #94a3b8">Bike demand:</span>
          <span style="font-size: 12px; font-weight: 500">${stationCount > 0 ? bikePct + "%" : "N/A"}</span>
        </div>
        <div style="font-size: 10px; color: #64748b; margin-bottom: 3px">${stationCount} station${stationCount !== 1 ? "s" : ""} within 400m</div>
        <div style="padding-top: 3px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; font-weight: 600; color: ${adviceColor}">${advice}</div>
      </div>
    `,
  };
}
