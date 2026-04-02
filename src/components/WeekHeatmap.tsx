import { occupancyToCss } from "../lib/colors";
import { dayName, formatHour, formatOccupancy } from "../lib/format";
import type { TimeSlot } from "../types";

interface WeekHeatmapProps {
  cityAverages: Float32Array;
  cityEnforcedFraction: Float32Array;
  timeSlot: TimeSlot;
  onCellClick: (dow: number, hour: number) => void;
}

export function WeekHeatmap({ cityAverages, cityEnforcedFraction, timeSlot, onCellClick }: WeekHeatmapProps) {
  return (
    <div className="absolute bottom-28 left-4 z-20 rounded-xl bg-gray-950/85 backdrop-blur-md border border-gray-800/50 p-3">
      <p className="text-[10px] text-gray-400 mb-1.5 font-medium uppercase tracking-wider">
        Weekly Pattern
      </p>

      <div className="flex gap-px">
        {/* Day labels */}
        <div className="flex flex-col gap-px mr-1 justify-end">
          {Array.from({ length: 7 }, (_, dow) => (
            <div
              key={dow}
              className="h-[10px] flex items-center text-[8px] text-gray-500 leading-none"
            >
              {dayName(dow)}
            </div>
          ))}
        </div>

        {/* Hour columns */}
        <div className="flex gap-px">
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} className="flex flex-col gap-px">
              {/* Hour label (show every 6 hours) */}
              {hour % 6 === 0 ? (
                <div className="text-[7px] text-gray-600 text-center h-2.5 leading-none">
                  {formatHour(hour).replace(" ", "")}
                </div>
              ) : (
                <div className="h-2.5" />
              )}

              {Array.from({ length: 7 }, (_, dow) => {
                const idx = dow * 24 + hour;
                const occ = cityAverages[idx];
                const enfFrac = cityEnforcedFraction[idx];
                const mostlyNotEnforced = enfFrac < 0.5;
                const isSelected = dow === timeSlot.dow && hour === timeSlot.hour;

                return (
                  <button
                    key={dow}
                    onClick={() => onCellClick(dow, hour)}
                    className="w-[10px] h-[10px] rounded-[2px] transition-all cursor-pointer hover:ring-1 hover:ring-white/30"
                    style={{
                      backgroundColor:
                        mostlyNotEnforced && occ <= 0
                          ? "rgba(59, 130, 246, 0.35)"
                          : occ > 0
                            ? occupancyToCss(occ, !mostlyNotEnforced)
                            : "rgba(255,255,255,0.04)",
                      opacity: occ > 0 || mostlyNotEnforced ? 0.8 : 0.3,
                      outline: isSelected ? "1.5px solid white" : "none",
                      outlineOffset: "-0.5px",
                    }}
                    title={`${dayName(dow)} ${formatHour(hour)}: ${formatOccupancy(occ, !mostlyNotEnforced)}`}
                    aria-label={`${dayName(dow)} ${formatHour(hour)}: ${formatOccupancy(occ, !mostlyNotEnforced)}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
