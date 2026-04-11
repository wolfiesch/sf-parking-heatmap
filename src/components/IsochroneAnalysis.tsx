import { useMemo } from "react";
import type { BlockData, TimeSlot, IsochroneOrigin } from "../types";
import { pointInFeature } from "../lib/geo";
import { getOccupancy, isEnforced } from "../lib/occupancy";
import { occupancyToCss, occupancyLabel } from "../lib/colors";
interface IsochroneAnalysisProps {
  blocks: BlockData[];
  timeSlot: TimeSlot;
  contours: Record<string, GeoJSON.Feature> | null;
  maxMinutes: number;
  origin: IsochroneOrigin | null;
}

interface ReachableBlock {
  block: BlockData;
  occupancy: number;
  enforced: boolean;
  band: number; // smallest contour band containing this block
}

/** Classify an occupancy value into availability tier */
function availabilityTier(occ: number): "available" | "moderate" | "difficult" | "nodata" {
  if (occ <= 0) return "nodata";
  if (occ <= 0.59) return "available";
  if (occ <= 0.79) return "moderate";
  return "difficult";
}

export function IsochroneAnalysis({
  blocks,
  timeSlot,
  contours,
  maxMinutes,
  origin,
}: IsochroneAnalysisProps) {
  const analysis = useMemo(() => {
    if (!contours || !origin || blocks.length === 0) return null;

    // Get the outermost contour for the overall reachable area
    const outerFeature = contours[String(maxMinutes)];
    if (!outerFeature) return null;

    // Test each block against contour bands (smallest first for band assignment)
    const reachable: ReachableBlock[] = [];
    const bandMinutes = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20].filter(
      (m) => m <= maxMinutes,
    );

    for (const block of blocks) {
      // Quick check: is this block within the outermost contour?
      if (!pointInFeature(block.lat, block.lng, outerFeature)) continue;

      const occ = getOccupancy(block, timeSlot);
      const enforced = isEnforced(block, timeSlot);

      // Find the tightest band containing this block
      let band = maxMinutes;
      for (const m of bandMinutes) {
        const feature = contours[String(m)];
        if (feature && pointInFeature(block.lat, block.lng, feature)) {
          band = m;
          break;
        }
      }

      reachable.push({ block, occupancy: occ, enforced, band });
    }

    // Availability breakdown
    const tiers = { available: 0, moderate: 0, difficult: 0, nodata: 0 };
    for (const r of reachable) {
      tiers[availabilityTier(r.occupancy)]++;
    }

    // Best nearby: blocks within 10 min with lowest occupancy (excluding no-data)
    const tenMinFeature = contours["10"];
    const nearby = reachable
      .filter((r) => {
        if (r.occupancy <= 0) return false;
        if (!tenMinFeature) return r.band <= 10;
        return pointInFeature(r.block.lat, r.block.lng, tenMinFeature);
      })
      .sort((a, b) => a.occupancy - b.occupancy)
      .slice(0, 3);

    return { reachable, tiers, nearby, total: reachable.length };
  }, [blocks, timeSlot, contours, maxMinutes, origin]);

  if (!analysis || analysis.total === 0) return null;

  const { tiers, nearby, total } = analysis;
  const withData = tiers.available + tiers.moderate + tiers.difficult;

  return (
    <div className="mt-2 pt-2 border-t border-gray-800/50">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[9px] text-gray-500 uppercase tracking-wider">
          Parking in reach
        </span>
        <span className="text-[10px] text-gray-400 tabular-nums">
          {total} blocks
        </span>
      </div>

      {/* Availability bar */}
      {withData > 0 && (
        <div className="mb-2">
          <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
            {tiers.available > 0 && (
              <div
                className="rounded-full"
                style={{
                  width: `${(tiers.available / withData) * 100}%`,
                  backgroundColor: "rgb(34, 197, 94)",
                }}
              />
            )}
            {tiers.moderate > 0 && (
              <div
                className="rounded-full"
                style={{
                  width: `${(tiers.moderate / withData) * 100}%`,
                  backgroundColor: "rgb(234, 179, 8)",
                }}
              />
            )}
            {tiers.difficult > 0 && (
              <div
                className="rounded-full"
                style={{
                  width: `${(tiers.difficult / withData) * 100}%`,
                  backgroundColor: "rgb(239, 68, 68)",
                }}
              />
            )}
          </div>
          <div className="flex justify-between mt-1 text-[9px] text-gray-500">
            {tiers.available > 0 && (
              <span style={{ color: "rgb(34, 197, 94)" }}>
                {Math.round((tiers.available / withData) * 100)}% avail
              </span>
            )}
            {tiers.moderate > 0 && (
              <span style={{ color: "rgb(234, 179, 8)" }}>
                {Math.round((tiers.moderate / withData) * 100)}% moderate
              </span>
            )}
            {tiers.difficult > 0 && (
              <span style={{ color: "rgb(239, 68, 68)" }}>
                {Math.round((tiers.difficult / withData) * 100)}% difficult
              </span>
            )}
          </div>
        </div>
      )}

      {/* Best nearby blocks within 10 min */}
      {nearby.length > 0 && (
        <div>
          <span className="text-[9px] text-gray-600 uppercase tracking-wider">
            Best within 10 min
          </span>
          <div className="mt-1 space-y-0.5">
            {nearby.map((r) => (
              <div
                key={r.block.id}
                className="flex items-center justify-between text-[10px] px-1.5 py-0.5 rounded bg-gray-900/40"
              >
                <span className="text-gray-400 truncate mr-2">
                  {r.block.street}
                </span>
                <span
                  className="shrink-0 font-medium tabular-nums"
                  style={{ color: occupancyToCss(r.occupancy, r.enforced) }}
                >
                  {Math.round(r.occupancy * 100)}% - {occupancyLabel(r.occupancy, r.enforced)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
