import { occupancyToCss } from "../lib/colors";
import { deltaToCss } from "../lib/deltaColors";
import { demandToCss, correlationToCss } from "../lib/bikeColors";
import type { ColumnStyle } from "../layers/parkingColumnLayer";
import type { TransportMode, ViewMode } from "../types";

const STYLE_LABELS: Record<ColumnStyle, string> = {
  hexgrid: "Hex Grid",
  columns: "Columns",
  bars: "Street Bars",
};

const STYLE_ORDER: ColumnStyle[] = ["columns", "bars", "hexgrid"];

interface LegendProps {
  is3D?: boolean;
  comparing?: boolean;
  columnStyle?: ColumnStyle;
  onColumnStyleChange?: (style: ColumnStyle) => void;
  isochroneActive?: boolean;
  isochroneMode?: TransportMode;
  viewMode?: ViewMode;
}

export function Legend({ is3D, comparing, columnStyle, onColumnStyleChange, isochroneActive, isochroneMode, viewMode }: LegendProps) {
  if (viewMode === "bike") {
    return <BikeLegend />;
  }

  if (viewMode === "correlation") {
    return <CorrelationLegend />;
  }

  if (comparing) {
    return <DeltaLegend is3D={is3D} />;
  }

  if (isochroneActive && isochroneMode) {
    return <IsochroneLegend mode={isochroneMode} />;
  }

  // Generate gradient stops
  const stops = Array.from({ length: 20 }, (_, i) => {
    const occ = i / 19;
    return `${occupancyToCss(occ)} ${Math.round((i / 19) * 100)}%`;
  });

  return (
    <div className="absolute bottom-28 right-4 z-20 rounded-xl bg-gray-950/80 backdrop-blur-md px-3 py-2.5 border border-gray-800/50">
      <p className="text-[10px] text-gray-400 mb-1.5 font-medium uppercase tracking-wider">
        Occupancy
      </p>
      <div
        className="h-2.5 w-36 rounded-full"
        style={{
          background: `linear-gradient(to right, ${stops.join(", ")})`,
        }}
      />
      <div className="flex justify-between mt-1 text-[10px] text-gray-500">
        <span>0%</span>
        <span>60%</span>
        <span>80%</span>
        <span>100%</span>
      </div>
      <div className="flex justify-between mt-0.5 text-[9px]">
        <span className="text-green-400">Available</span>
        <span className="text-yellow-400">Moderate</span>
        <span className="text-red-400">Difficult</span>
      </div>

      {/* 3D height explanation */}
      {is3D && (
        <div className="mt-2 pt-2 border-t border-gray-800/40">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-gray-500" style={{
              clipPath: "polygon(20% 100%, 80% 100%, 65% 30%, 35% 30%)",
            }} />
            <span className="text-[9px] text-gray-400">Height = occupancy level</span>
          </div>
        </div>
      )}

      {/* 3D style toggle (visible at column zoom tier) */}
      {is3D && columnStyle && onColumnStyleChange && (
        <div className="mt-2 pt-2 border-t border-gray-800/40">
          <p className="text-[9px] text-gray-500 mb-1">3D Style</p>
          <div className="flex gap-1">
            {STYLE_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => onColumnStyleChange(s)}
                className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                  columnStyle === s
                    ? "bg-green-500/30 text-green-300 border border-green-500/40"
                    : "bg-gray-800/60 text-gray-500 border border-gray-700/40 hover:text-gray-300"
                }`}
              >
                {STYLE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Non-enforced / pressure legend */}
      <div className="mt-2 pt-2 border-t border-gray-800/40">
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: "rgba(59, 130, 246, 0.6)" }} />
          <span className="text-[9px] text-gray-400">Free Parking (meters off)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-3 h-2 rounded-sm"
            style={{
              background: "linear-gradient(to right, rgba(34,197,94,0.55), rgba(234,179,8,0.55), rgba(239,68,68,0.55))",
            }}
          />
          <span className="text-[9px] text-gray-400">Estimated from complaints</span>
        </div>
      </div>
    </div>
  );
}

function DeltaLegend({ is3D }: { is3D?: boolean }) {
  const stops = Array.from({ length: 11 }, (_, i) => {
    const delta = (i - 5) * 0.06; // -0.30 to +0.30
    return `${deltaToCss(delta, true)} ${Math.round((i / 10) * 100)}%`;
  });

  return (
    <div className="absolute bottom-28 right-4 z-20 rounded-xl bg-gray-950/80 backdrop-blur-md px-3 py-2.5 border border-purple-800/50">
      <p className="text-[10px] text-purple-300 mb-1.5 font-medium uppercase tracking-wider">
        Comparison
      </p>
      <div
        className="h-2.5 w-36 rounded-full"
        style={{
          background: `linear-gradient(to right, ${stops.join(", ")})`,
        }}
      />
      <div className="flex justify-between mt-1 text-[10px] text-gray-500">
        <span>-30%</span>
        <span>0</span>
        <span>+30%</span>
      </div>
      <div className="flex justify-between mt-0.5 text-[9px]">
        <span className="text-blue-400">Less busy</span>
        <span className="text-gray-400">Same</span>
        <span className="text-red-400">More busy</span>
      </div>
      {is3D && (
        <div className="mt-2 pt-2 border-t border-gray-800/40">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-gray-500" style={{
              clipPath: "polygon(20% 100%, 80% 100%, 65% 30%, 35% 30%)",
            }} />
            <span className="text-[9px] text-gray-400">Height = magnitude of change</span>
          </div>
        </div>
      )}
    </div>
  );
}

import { legendGradientCss, modeAccentCss } from "../lib/isochroneColors";

const ISO_MODE_LABELS: Record<TransportMode, string> = {
  driving: "Driving",
  cycling: "Cycling",
  walking: "Walking",
};

function IsochroneLegend({ mode }: { mode: TransportMode }) {
  const label = ISO_MODE_LABELS[mode];
  const accent = modeAccentCss(mode);
  const gradient = legendGradientCss(mode);

  return (
    <div className="absolute bottom-28 right-4 z-20 rounded-xl bg-gray-950/80 backdrop-blur-md px-3 py-2.5 border border-gray-800/50">
      <p
        className="text-[10px] mb-1.5 font-medium uppercase tracking-wider"
        style={{ color: accent }}
      >
        {label} Isochrone
      </p>

      {/* Smooth gradient bar matching the map visualization */}
      <div
        className="h-2.5 w-36 rounded-full"
        style={{ background: gradient }}
      />
      <div className="flex justify-between mt-1 text-[10px] text-gray-500 tabular-nums">
        <span>2 min</span>
        <span>10</span>
        <span>20</span>
      </div>
      <div className="flex justify-between mt-0.5 text-[9px]">
        <span style={{ color: accent }}>Close</span>
        <span className="text-gray-500">Reachable</span>
        <span className="text-gray-600">Far</span>
      </div>

      <div className="mt-2 pt-2 border-t border-gray-800/40">
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <span className="text-[9px] text-gray-400">Origin point</span>
        </div>
        <p className="text-[9px] text-gray-500 mt-1">
          Rings shrink during rush hours
        </p>
      </div>
    </div>
  );
}

function BikeLegend() {
  const stops = Array.from({ length: 20 }, (_, i) => {
    const demand = i / 19;
    return `${demandToCss(demand)} ${Math.round((i / 19) * 100)}%`;
  });

  return (
    <div className="absolute bottom-28 right-4 z-20 rounded-xl bg-gray-950/80 backdrop-blur-md px-3 py-2.5 border border-teal-800/50">
      <p className="text-[10px] text-teal-300 mb-1.5 font-medium uppercase tracking-wider">
        Bike Demand
      </p>
      <div
        className="h-2.5 w-36 rounded-full"
        style={{
          background: `linear-gradient(to right, ${stops.join(", ")})`,
        }}
      />
      <div className="flex justify-between mt-1 text-[10px] text-gray-500">
        <span>0%</span>
        <span>30%</span>
        <span>60%</span>
        <span>100%</span>
      </div>
      <div className="flex justify-between mt-0.5 text-[9px]">
        <span className="text-teal-300">Quiet</span>
        <span className="text-teal-400">Moderate</span>
        <span className="text-cyan-500">Peak</span>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-800/40">
        <p className="text-[9px] text-gray-500">
          High demand = popular pickup = fewer bikes available
        </p>
      </div>
    </div>
  );
}

function CorrelationLegend() {
  const stops = Array.from({ length: 10 }, (_, i) => {
    const score = i / 9;
    return `${correlationToCss(score)} ${Math.round((i / 9) * 100)}%`;
  });

  return (
    <div className="absolute bottom-28 right-4 z-20 rounded-xl bg-gray-950/80 backdrop-blur-md px-3 py-2.5 border border-green-800/50">
      <p className="text-[10px] text-green-300 mb-1.5 font-medium uppercase tracking-wider">
        Bike Alternative
      </p>
      <div
        className="h-2.5 w-36 rounded-full"
        style={{
          background: `linear-gradient(to right, ${stops.join(", ")})`,
        }}
      />
      <div className="flex justify-between mt-1 text-[10px] text-gray-500">
        <span>Low</span>
        <span>High</span>
      </div>
      <div className="flex justify-between mt-0.5 text-[9px]">
        <span className="text-gray-400">No advantage</span>
        <span className="text-green-400">Bike instead!</span>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-800/40">
        <p className="text-[9px] text-gray-500">
          Green = parking hard + bikes available
        </p>
      </div>
    </div>
  );
}
