import type { BlockData, TimeSlot } from "../types";

/** Get the slot index for a given day-of-week and hour */
export function getTimeSlotIndex(dow: number, hour: number): number {
  return dow * 24 + hour;
}

/** Get occupancy for a block at a given time slot */
export function getOccupancy(block: BlockData, slot: TimeSlot): number {
  return block.slots[getTimeSlotIndex(slot.dow, slot.hour)] ?? 0;
}

/** Check if a block's meters are enforced at a given time slot */
export function isEnforced(block: BlockData, slot: TimeSlot): boolean {
  if (!block.enforced) return true; // assume enforced if no data
  return block.enforced[getTimeSlotIndex(slot.dow, slot.hour)] === 1;
}

/** Check enforcement by slot index */
export function isEnforcedAt(block: BlockData, slotIdx: number): boolean {
  if (!block.enforced) return true;
  return block.enforced[slotIdx] === 1;
}

/** Data source for a slot: meter data during enforced hours, pressure during non-enforced */
export type DataSource = "meter" | "pressure" | "none";

export function getDataSource(block: BlockData, slot: TimeSlot): DataSource {
  const enforced = isEnforced(block, slot);
  const occ = getOccupancy(block, slot);
  if (enforced) return occ > 0 ? "meter" : "none";
  return occ > 0 ? "pressure" : "none";
}

/** Compute city-wide average occupancy for a time slot */
export function getCityAverage(blocks: BlockData[], slot: TimeSlot): number {
  const idx = getTimeSlotIndex(slot.dow, slot.hour);
  let sum = 0;
  let count = 0;
  for (const block of blocks) {
    const v = block.slots[idx];
    if (v > 0) {
      sum += v;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/** Pre-compute city averages for all 168 slots */
export function computeAllCityAverages(blocks: BlockData[]): Float32Array {
  const avgs = new Float32Array(168);
  for (let i = 0; i < 168; i++) {
    let sum = 0;
    let count = 0;
    for (const block of blocks) {
      const v = block.slots[i];
      if (v > 0) {
        sum += v;
        count++;
      }
    }
    avgs[i] = count > 0 ? sum / count : 0;
  }
  return avgs;
}
