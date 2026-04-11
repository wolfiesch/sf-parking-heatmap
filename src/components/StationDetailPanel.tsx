import { X, Clock, Bike } from "lucide-react";
import type { StationData, TimeSlot } from "../types";
import { demandToCss, demandLabel } from "../lib/bikeColors";
import { dayName, formatHour } from "../lib/format";
import { getTimeSlotIndex } from "../lib/occupancy";

interface StationDetailPanelProps {
  station: StationData | null;
  timeSlot: TimeSlot;
  onClose: () => void;
}

export function StationDetailPanel({ station, timeSlot, onClose }: StationDetailPanelProps) {
  if (!station) return null;

  const slotIdx = getTimeSlotIndex(timeSlot.dow, timeSlot.hour);
  const demand = station.slots[slotIdx] ?? 0;
  const arrivals = station.arrivals[slotIdx] ?? 0;
  const label = demandLabel(demand);

  return (
    <div className="absolute top-0 right-0 bottom-0 z-30 w-80 bg-gray-950/95 backdrop-blur-xl border-l border-gray-800/50 overflow-y-auto panel-slide-in">
      {/* Header */}
      <div className="sticky top-0 bg-gray-950/95 backdrop-blur-xl border-b border-gray-800/30 px-4 py-3 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate">{station.name}</h2>
          <p className="text-xs text-gray-400 truncate">{station.id}</p>
        </div>
        <button
          onClick={onClose}
          className="ml-2 p-1 rounded-lg hover:bg-gray-800 transition-colors"
          aria-label="Close"
        >
          <X size={16} className="text-gray-400" />
        </button>
      </div>

      {/* Current demand */}
      <div className="px-4 py-3 border-b border-gray-800/30">
        <div className="flex items-center gap-2 mb-2">
          <Bike size={14} className="text-teal-400" />
          <span className="text-xs text-gray-400">Current Demand</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className="text-3xl font-bold"
            style={{ color: demandToCss(demand) }}
          >
            {demand > 0 ? `${Math.round(demand * 100)}%` : "N/A"}
          </span>
          <span
            className="text-sm"
            style={{ color: demandToCss(demand) }}
          >
            {label}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {station.capacity} docks - Arrivals: {arrivals > 0 ? `${Math.round(arrivals * 100)}%` : "N/A"}
        </p>
      </div>

      {/* 7x24 mini heatmap */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={14} className="text-gray-400" />
          <span className="text-xs text-gray-400">Weekly Demand Profile</span>
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
                  const d = station.slots[idx] ?? 0;
                  const isSelected = dow === timeSlot.dow && hour === timeSlot.hour;

                  return (
                    <div
                      key={dow}
                      className="w-[9px] h-[9px] rounded-[1px]"
                      style={{
                        backgroundColor: d > 0 ? demandToCss(d) : "rgba(255,255,255,0.04)",
                        opacity: d > 0 ? 0.85 : 0.3,
                        outline: isSelected ? "1px solid white" : "none",
                      }}
                      title={`${dayName(dow)} ${formatHour(hour)}: ${d > 0 ? Math.round(d * 100) + "%" : "N/A"}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Busiest/quietest times */}
      <div className="px-4 py-3 border-t border-gray-800/30">
        <BusiestQuietestTimes slots={station.slots} />
      </div>
    </div>
  );
}

function BusiestQuietestTimes({ slots }: { slots: number[] }) {
  const businessSlots: { dow: number; hour: number; demand: number }[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 6; hour <= 22; hour++) {
      const idx = dow * 24 + hour;
      const d = slots[idx];
      if (d > 0) {
        businessSlots.push({ dow, hour, demand: d });
      }
    }
  }

  if (businessSlots.length === 0) {
    return <p className="text-xs text-gray-500">No demand data</p>;
  }

  businessSlots.sort((a, b) => a.demand - b.demand);

  const quietest = businessSlots.slice(0, 3);
  const busiest = businessSlots.slice(-3).reverse();

  return (
    <div className="space-y-2">
      <div>
        <p className="text-[10px] text-teal-400 font-medium mb-1">Quietest (bikes available)</p>
        {quietest.map((s, i) => (
          <p key={i} className="text-xs text-gray-300">
            {dayName(s.dow)} {formatHour(s.hour)} - {Math.round(s.demand * 100)}%
          </p>
        ))}
      </div>
      <div>
        <p className="text-[10px] text-cyan-400 font-medium mb-1">Busiest (bikes scarce)</p>
        {busiest.map((s, i) => (
          <p key={i} className="text-xs text-gray-300">
            {dayName(s.dow)} {formatHour(s.hour)} - {Math.round(s.demand * 100)}%
          </p>
        ))}
      </div>
    </div>
  );
}
