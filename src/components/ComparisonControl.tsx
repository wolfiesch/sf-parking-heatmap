import { Pin, X } from "lucide-react";
import type { TimeSlot } from "../types";
import { formatTimeSlot } from "../lib/format";

interface ComparisonControlProps {
  comparing: boolean;
  referenceSlot: TimeSlot | null;
  currentSlot: TimeSlot;
  onPin: () => void;
  onExit: () => void;
}

export function ComparisonControl({
  comparing,
  referenceSlot,
  currentSlot,
  onPin,
  onExit,
}: ComparisonControlProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onPin}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all ${
          comparing
            ? "bg-purple-500/80 text-white"
            : "bg-gray-800/60 text-gray-400 hover:bg-gray-700/60 border border-gray-700/50"
        }`}
        title={comparing ? "Exit comparison (Esc)" : `Pin ${formatTimeSlot(currentSlot.dow, currentSlot.hour)} as reference (C)`}
      >
        <Pin size={12} />
        {comparing ? "Comparing" : "Compare"}
      </button>

      {comparing && referenceSlot && (
        <>
          <span className="text-[10px] text-purple-300">
            vs {formatTimeSlot(referenceSlot.dow, referenceSlot.hour)}
          </span>
          <button
            onClick={onExit}
            className="p-0.5 rounded hover:bg-gray-800 transition-colors"
            title="Exit comparison"
          >
            <X size={12} className="text-gray-400" />
          </button>
        </>
      )}
    </div>
  );
}
