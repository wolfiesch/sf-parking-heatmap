import { TrendingUp, TrendingDown } from "lucide-react";
import type { BlockData, TimeSlot } from "../types";
import { getOccupancy, isEnforced } from "../lib/occupancy";
import { formatOccupancy } from "../lib/format";
import { occupancyToCss } from "../lib/colors";

interface NeighborhoodSummaryProps {
  blocks: BlockData[];
  timeSlot: TimeSlot;
}

interface HoodSummary {
  name: string;
  avgOcc: number;
  blockCount: number;
}

export function NeighborhoodSummary({ blocks, timeSlot }: NeighborhoodSummaryProps) {
  // Check if most blocks are non-enforced right now
  let enforcedCount = 0;
  let totalWithHood = 0;
  for (const block of blocks) {
    if (!block.hood) continue;
    totalWithHood++;
    if (isEnforced(block, timeSlot)) enforcedCount++;
  }
  const mostlyNotEnforced = totalWithHood > 0 && enforcedCount / totalWithHood < 0.3;

  // Group blocks by neighborhood and compute average occupancy
  const hoodMap = new Map<string, { sum: number; count: number }>();
  for (const block of blocks) {
    if (!block.hood) continue;
    const occ = getOccupancy(block, timeSlot);
    if (occ <= 0) continue;

    const existing = hoodMap.get(block.hood);
    if (existing) {
      existing.sum += occ;
      existing.count++;
    } else {
      hoodMap.set(block.hood, { sum: occ, count: 1 });
    }
  }

  const hoods: HoodSummary[] = [];
  for (const [name, { sum, count }] of hoodMap) {
    if (count >= 3) {
      hoods.push({ name, avgOcc: sum / count, blockCount: count });
    }
  }

  // During fully non-enforced hours with no data, show meters off message
  if (hoods.length === 0) {
    if (mostlyNotEnforced) {
      return (
        <div className="absolute top-16 right-4 z-20 rounded-xl bg-gray-950/80 backdrop-blur-md border border-gray-800/50 p-3 w-56">
          <p className="text-xs text-blue-400 font-medium">Meters Off</p>
          <p className="text-[10px] text-gray-500 mt-1">
            Free street parking during non-enforced hours
          </p>
        </div>
      );
    }
    return null;
  }

  hoods.sort((a, b) => b.avgOcc - a.avgOcc);
  const busiest = hoods.slice(0, 3);
  const emptiest = hoods
    .filter((h) => h.avgOcc > 0)
    .sort((a, b) => a.avgOcc - b.avgOcc)
    .slice(0, 3);

  return (
    <div className="absolute top-16 right-4 z-20 rounded-xl bg-gray-950/80 backdrop-blur-md border border-gray-800/50 p-3 w-56">
      <div className="mb-2">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp size={12} className="text-red-400" />
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
            Busiest
          </span>
        </div>
        {busiest.map((h) => (
          <div key={h.name} className="flex justify-between items-center py-0.5">
            <span className="text-xs text-gray-300 truncate mr-2">{h.name}</span>
            <span
              className="text-xs font-medium flex-shrink-0"
              style={{ color: occupancyToCss(h.avgOcc) }}
            >
              {formatOccupancy(h.avgOcc)}
            </span>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingDown size={12} className="text-green-400" />
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
            Most Available
          </span>
        </div>
        {emptiest.map((h) => (
          <div key={h.name} className="flex justify-between items-center py-0.5">
            <span className="text-xs text-gray-300 truncate mr-2">{h.name}</span>
            <span
              className="text-xs font-medium flex-shrink-0"
              style={{ color: occupancyToCss(h.avgOcc) }}
            >
              {formatOccupancy(h.avgOcc)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
