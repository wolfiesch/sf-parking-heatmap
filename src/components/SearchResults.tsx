import { MapPin } from "lucide-react";
import type { BlockData, TimeSlot } from "../types";
import { occupancyToCss, occupancyLabel } from "../lib/colors";
import { getOccupancy, isEnforced } from "../lib/occupancy";
import { formatOccupancy } from "../lib/format";

interface SearchResultsProps {
  blocks: BlockData[];
  timeSlot: TimeSlot;
  onBlockClick: (block: BlockData) => void;
}

export function SearchResults({ blocks, timeSlot, onBlockClick }: SearchResultsProps) {
  if (blocks.length === 0) {
    return (
      <div className="absolute top-20 left-4 z-20 w-64 rounded-xl bg-gray-950/90 backdrop-blur-md border border-gray-800/50 px-3 py-3">
        <p className="text-xs text-gray-500 text-center">No blocks found in this area</p>
      </div>
    );
  }

  return (
    <div className="absolute top-20 left-4 z-20 w-64 max-h-[60vh] rounded-xl bg-gray-950/90 backdrop-blur-md border border-gray-800/50 overflow-hidden panel-slide-in">
      <div className="px-3 py-2 border-b border-gray-800/30">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
          {blocks.length} Nearby Block{blocks.length !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="overflow-y-auto max-h-[calc(60vh-32px)]">
        {blocks.map((block) => {
          const occ = getOccupancy(block, timeSlot);
          const enforced = isEnforced(block, timeSlot);
          return (
            <button
              key={block.id}
              onClick={() => onBlockClick(block)}
              className="w-full text-left px-3 py-2 hover:bg-gray-800/40 transition-colors border-b border-gray-800/20 last:border-0"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin size={10} className="text-gray-500 flex-shrink-0" />
                  <span className="text-xs text-white truncate">{block.id}</span>
                </div>
                <span
                  className="text-xs font-medium flex-shrink-0 ml-2"
                  style={{ color: occupancyToCss(occ, enforced) }}
                >
                  {formatOccupancy(occ, enforced)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[10px] text-gray-500 truncate">{block.street || block.hood}</span>
                <span
                  className="text-[9px] flex-shrink-0 ml-2"
                  style={{ color: occupancyToCss(occ, enforced) }}
                >
                  {occupancyLabel(occ, enforced)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
