import type { BlockData, TimeSlot } from "../types";
import { formatOccupancy, formatHour, dayName } from "../lib/format";
import { occupancyLabel } from "../lib/colors";
import { getOccupancy, isEnforced, getDataSource, getTimeSlotIndex } from "../lib/occupancy";
import { deltaToCss, formatDelta } from "../lib/deltaColors";

/** Generate tooltip content for a hovered block */
export function getBlockTooltipContent(block: BlockData, timeSlot: TimeSlot) {
  const occ = getOccupancy(block, timeSlot);
  const enforced = isEnforced(block, timeSlot);
  const label = occupancyLabel(occ, enforced);
  const pct = formatOccupancy(occ, enforced);
  const source = getDataSource(block, timeSlot);

  const sourceLabel =
    source === "meter" ? "(Meter data)" :
    source === "pressure" ? "(Based on parking complaints)" :
    enforced ? "" : "";

  const labelColor = !enforced
    ? (occ <= 0 ? '#3b82f6' : occ <= 0.59 ? '#22c55e' : occ <= 0.79 ? '#eab308' : '#ef4444')
    : (occ <= 0 ? '#6b7280' : occ <= 0.59 ? '#22c55e' : occ <= 0.79 ? '#eab308' : '#ef4444');

  const statusLine = !enforced && occ <= 0
    ? '<div style="font-size: 11px; color: #3b82f6; margin-bottom: 2px">Meters Off</div>'
    : "";

  return {
    html: `
      <div style="min-width: 140px">
        <div style="font-weight: 600; margin-bottom: 3px">${block.id}</div>
        ${block.hood ? `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px">${block.hood}</div>` : ""}
        ${statusLine}
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 12px">${dayName(timeSlot.dow)} ${formatHour(timeSlot.hour)}</span>
          <span style="font-weight: 600; font-size: 14px">${pct}</span>
        </div>
        <div style="font-size: 11px; color: ${labelColor}">${label}</div>
        ${sourceLabel ? `<div style="font-size: 9px; color: #64748b; margin-top: 1px">${sourceLabel}</div>` : ""}
        <div style="font-size: 10px; color: #64748b; margin-top: 2px">${block.meters} meter${block.meters !== 1 ? 's' : ''}</div>
      </div>
    `,
  };
}

/** Generate tooltip content for comparison (delta) mode */
export function getDeltaTooltipContent(
  block: BlockData,
  currentSlot: TimeSlot,
  referenceSlot: TimeSlot,
) {
  const curIdx = getTimeSlotIndex(currentSlot.dow, currentSlot.hour);
  const refIdx = getTimeSlotIndex(referenceSlot.dow, referenceSlot.hour);
  const curOcc = block.slots[curIdx] ?? 0;
  const refOcc = block.slots[refIdx] ?? 0;
  const delta = curOcc - refOcc;
  const hasData = curOcc > 0 || refOcc > 0;
  const deltaColor = deltaToCss(delta, hasData);

  return {
    html: `
      <div style="min-width: 160px">
        <div style="font-weight: 600; margin-bottom: 3px">${block.id}</div>
        ${block.hood ? `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px">${block.hood}</div>` : ""}
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px">
          <span style="font-size: 11px; color: #94a3b8">Now:</span>
          <span style="font-size: 12px; font-weight: 500">${formatOccupancy(curOcc)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px">
          <span style="font-size: 11px; color: #94a3b8">Reference:</span>
          <span style="font-size: 12px; font-weight: 500">${formatOccupancy(refOcc)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding-top: 3px; border-top: 1px solid rgba(255,255,255,0.1)">
          <span style="font-size: 11px; color: #94a3b8">Delta:</span>
          <span style="font-size: 14px; font-weight: 700; color: ${deltaColor}">${hasData ? formatDelta(delta) : 'N/A'}</span>
        </div>
      </div>
    `,
  };
}
