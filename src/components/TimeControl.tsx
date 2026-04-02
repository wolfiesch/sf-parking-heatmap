import { Play, Pause, SkipForward } from "lucide-react";
import { dayName } from "../lib/format";
import { formatHour, formatTimeSlot } from "../lib/format";
import type { TimeSlot } from "../types";

interface TimeControlProps {
  timeSlot: TimeSlot;
  isPlaying: boolean;
  speed: number;
  onDowChange: (dow: number) => void;
  onHourChange: (hour: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  children?: React.ReactNode;
}

const SPEED_OPTIONS = [
  { label: "0.5x", value: 1000 },
  { label: "1x", value: 500 },
  { label: "2x", value: 250 },
  { label: "4x", value: 125 },
];

const HOUR_TICKS = [6, 9, 12, 15, 18, 21];

export function TimeControl({
  timeSlot,
  isPlaying,
  speed,
  onDowChange,
  onHourChange,
  onTogglePlay,
  onSpeedChange,
  children,
}: TimeControlProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
      <div className="mx-auto max-w-3xl px-4 pb-4 pointer-events-auto">
        <div className="rounded-2xl bg-gray-950/85 backdrop-blur-md border border-gray-800/50 px-4 py-3">
          {/* Current time label + comparison control */}
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className={`text-sm font-medium ${isPlaying ? "play-pulse" : ""}`}>
              {formatTimeSlot(timeSlot.dow, timeSlot.hour)}
            </span>
            {children}
          </div>

          {/* Day pills */}
          <div className="flex justify-center gap-1.5 mb-3">
            {Array.from({ length: 7 }, (_, i) => (
              <button
                key={i}
                onClick={() => onDowChange(i)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  i === timeSlot.dow
                    ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                    : "bg-gray-800/60 text-gray-400 hover:bg-gray-700/60 border border-gray-700/50"
                }`}
              >
                {dayName(i)}
              </button>
            ))}
          </div>

          {/* Hour slider + playback */}
          <div className="flex items-center gap-3">
            {/* Play/pause */}
            <button
              onClick={onTogglePlay}
              className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-400 flex items-center justify-center transition-colors"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
            </button>

            {/* Hour slider */}
            <div className="flex-1 relative">
              <input
                type="range"
                min={0}
                max={23}
                value={timeSlot.hour}
                onChange={(e) => onHourChange(parseInt(e.target.value))}
                className="w-full"
                aria-label="Hour"
                aria-valuetext={formatHour(timeSlot.hour)}
              />
              {/* Tick labels */}
              <div className="flex justify-between mt-0.5 px-0.5">
                {HOUR_TICKS.map((h) => (
                  <span key={h} className="text-[9px] text-gray-600">
                    {formatHour(h)}
                  </span>
                ))}
              </div>
            </div>

            {/* Speed selector */}
            <div className="flex-shrink-0 flex items-center gap-1">
              <SkipForward size={12} className="text-gray-500" />
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onSpeedChange(opt.value)}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                    speed === opt.value
                      ? "bg-gray-700 text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
