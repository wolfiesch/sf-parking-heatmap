import { Car, Bike, Layers } from "lucide-react";
import type { ViewMode } from "../types";

const MODES: { key: ViewMode; label: string; Icon: typeof Car }[] = [
  { key: "parking", label: "Parking", Icon: Car },
  { key: "bike", label: "Bikes", Icon: Bike },
  { key: "correlation", label: "Overlap", Icon: Layers },
];

interface ViewModeToggleProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ mode, onModeChange }: ViewModeToggleProps) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-gray-900/80 backdrop-blur-md border border-gray-800/50 p-0.5">
      {MODES.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onModeChange(key)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
            mode === key
              ? key === "bike"
                ? "bg-teal-500/25 text-teal-300 border border-teal-500/40"
                : key === "correlation"
                  ? "bg-green-500/25 text-green-300 border border-green-500/40"
                  : "bg-blue-500/25 text-blue-300 border border-blue-500/40"
              : "text-gray-400 border border-transparent hover:text-gray-200 hover:bg-gray-800/50"
          }`}
          aria-label={`Switch to ${label} view`}
        >
          <Icon size={14} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
