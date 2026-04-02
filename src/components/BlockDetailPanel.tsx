import { X, Clock, Gauge } from "lucide-react";
import type { BlockData, TimeSlot } from "../types";
import { useBlockDetail } from "../hooks/useBlockDetail";
import { occupancyToCss, occupancyLabel } from "../lib/colors";
import { dayName, formatHour, formatOccupancy } from "../lib/format";
import { getOccupancy, isEnforced, isEnforcedAt, getDataSource, getTimeSlotIndex } from "../lib/occupancy";
import { deltaToCss, formatDelta } from "../lib/deltaColors";

interface BlockDetailPanelProps {
  block: BlockData | null;
  timeSlot: TimeSlot;
  onClose: () => void;
  comparing?: boolean;
  referenceSlot?: TimeSlot | null;
}

export function BlockDetailPanel({ block, timeSlot, onClose, comparing, referenceSlot }: BlockDetailPanelProps) {
  const { detail, loading } = useBlockDetail(
    block?.id ?? null,
    block?.meters ?? 0,
    block?.street ?? "",
  );

  if (!block) return null;

  const currentOcc = getOccupancy(block, timeSlot);
  const enforced = isEnforced(block, timeSlot);
  const source = getDataSource(block, timeSlot);
  const slots = detail?.slots ?? block.slots;

  return (
    <div className="absolute top-0 right-0 bottom-0 z-30 w-80 bg-gray-950/95 backdrop-blur-xl border-l border-gray-800/50 overflow-y-auto panel-slide-in">
      {/* Header */}
      <div className="sticky top-0 bg-gray-950/95 backdrop-blur-xl border-b border-gray-800/30 px-4 py-3 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate">{block.id}</h2>
          {block.street && (
            <p className="text-xs text-gray-400 truncate">{block.street}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-2 p-1 rounded-lg hover:bg-gray-800 transition-colors"
          aria-label="Close"
        >
          <X size={16} className="text-gray-400" />
        </button>
      </div>

      {/* Current occupancy */}
      <div className="px-4 py-3 border-b border-gray-800/30">
        <div className="flex items-center gap-2 mb-2">
          <Gauge size={14} className="text-gray-400" />
          <span className="text-xs text-gray-400">Current Selection</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className="text-3xl font-bold"
            style={{ color: occupancyToCss(currentOcc, enforced) }}
          >
            {formatOccupancy(currentOcc, enforced)}
          </span>
          <span
            className="text-sm"
            style={{ color: occupancyToCss(currentOcc, enforced) }}
          >
            {occupancyLabel(currentOcc, enforced)}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {block.meters} meter{block.meters !== 1 ? "s" : ""} on this block
          {!enforced && " - meters off"}
          {block.supply != null && ` / ${block.supply} total spaces`}
        </p>
        {source === "pressure" && (
          <p className="text-[10px] text-gray-600 mt-0.5">Based on parking complaints</p>
        )}

        {/* Delta info in comparison mode */}
        {comparing && referenceSlot && (() => {
          const refIdx = getTimeSlotIndex(referenceSlot.dow, referenceSlot.hour);
          const refOcc = block.slots[refIdx] ?? 0;
          const delta = currentOcc - refOcc;
          const hasData = currentOcc > 0 || refOcc > 0;
          return (
            <div className="mt-2 pt-2 border-t border-purple-800/30">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Reference:</span>
                <span className="font-medium">{formatOccupancy(refOcc)}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-gray-400">Delta:</span>
                <span
                  className="font-bold text-sm"
                  style={{ color: deltaToCss(delta, hasData) }}
                >
                  {hasData ? formatDelta(delta) : "N/A"}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 7x24 mini heatmap for this block */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={14} className="text-gray-400" />
          <span className="text-xs text-gray-400">
            Weekly Profile {loading && "(loading...)"}
          </span>
        </div>

        <div className="flex gap-px">
          {/* Day labels */}
          <div className="flex flex-col gap-px mr-1 justify-start mt-3">
            {Array.from({ length: 7 }, (_, dow) => (
              <div
                key={dow}
                className="h-[9px] flex items-center text-[7px] text-gray-500 leading-none"
              >
                {dayName(dow)}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div className="flex gap-px flex-1">
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="flex flex-col gap-px">
                {hour % 6 === 0 && (
                  <div className="text-[6px] text-gray-600 text-center h-3 leading-none flex items-end justify-center">
                    {hour}h
                  </div>
                )}
                {hour % 6 !== 0 && <div className="h-3" />}

                {Array.from({ length: 7 }, (_, dow) => {
                  const idx = dow * 24 + hour;
                  const occ = slots[idx];
                  const slotEnforced = isEnforcedAt(block, idx);
                  const isSelected = dow === timeSlot.dow && hour === timeSlot.hour;

                  return (
                    <div
                      key={dow}
                      className="w-[9px] h-[9px] rounded-[1px]"
                      style={{
                        backgroundColor:
                          !slotEnforced && occ <= 0
                            ? "rgba(59, 130, 246, 0.35)"
                            : occ > 0
                              ? occupancyToCss(occ, slotEnforced)
                              : "rgba(255,255,255,0.04)",
                        opacity: occ > 0 || !slotEnforced ? 0.85 : 0.3,
                        outline: isSelected ? "1px solid white" : "none",
                      }}
                      title={`${dayName(dow)} ${formatHour(hour)}: ${formatOccupancy(occ, slotEnforced)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Best/worst times */}
      <div className="px-4 py-3 border-t border-gray-800/30">
        <BestWorstTimes slots={slots} />
      </div>
    </div>
  );
}

function BestWorstTimes({ slots }: { slots: number[] }) {
  // Find best (lowest occupancy during business hours 8am-8pm) and worst times
  const businessSlots: { dow: number; hour: number; occ: number }[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 8; hour <= 20; hour++) {
      const idx = dow * 24 + hour;
      const occ = slots[idx];
      if (occ > 0) {
        businessSlots.push({ dow, hour, occ });
      }
    }
  }

  if (businessSlots.length === 0) {
    return <p className="text-xs text-gray-500">No data for business hours</p>;
  }

  businessSlots.sort((a, b) => a.occ - b.occ);

  const best = businessSlots.slice(0, 3);
  const worst = businessSlots.slice(-3).reverse();

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[10px] text-green-400 font-medium mb-1">Easiest Parking</p>
        {best.map((s, i) => (
          <p key={i} className="text-xs text-gray-300">
            {dayName(s.dow)} {formatHour(s.hour)} - {formatOccupancy(s.occ)}
          </p>
        ))}
      </div>
      <div>
        <p className="text-[10px] text-red-400 font-medium mb-1">Hardest Parking</p>
        {worst.map((s, i) => (
          <p key={i} className="text-xs text-gray-300">
            {dayName(s.dow)} {formatHour(s.hour)} - {formatOccupancy(s.occ)}
          </p>
        ))}
      </div>
    </div>
  );
}
