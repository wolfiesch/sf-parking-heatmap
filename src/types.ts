import type { MapViewState } from "deck.gl";

/** A metered block with its centroid and typical-week occupancy profile */
export interface BlockData {
  id: string;
  lat: number;
  lng: number;
  meters: number;
  street: string;
  hood: string;
  /** 168-element array indexed as (dow * 24 + hour), dow: 0=Mon..6=Sun (ISO) */
  slots: number[];
  /** 168-element array of 0/1 indicating meter enforcement per slot */
  enforced?: number[];
  /** Total parking spaces on this block (from supply data) */
  supply?: number;
  /** Grid-snapped 2-point path [[lng, lat], [lng, lat]] for PathLayer rendering */
  path?: [number, number][];
  /** Original individual meter positions [[lng, lat], ...] for deep-zoom dots */
  meterPositions?: [number, number][];
}

/** Pre-computed parking data loaded from parking_week.json */
export interface ParkingWeekData {
  generated: string;
  dateRange: { from: string; to: string };
  blocks: BlockData[];
}

/** Current time selection for the heatmap */
export interface TimeSlot {
  /** Day of week: 0=Monday through 6=Sunday (ISO 8601) */
  dow: number;
  /** Hour: 0-23 */
  hour: number;
}

/** Block detail from on-demand SODA query */
export interface BlockDetail {
  blockId: string;
  street: string;
  meters: number;
  /** Full 168-slot profile */
  slots: number[];
  /** Raw session counts per slot (for display) */
  sessionCounts: number[];
  /** 168-element enforcement mask from parent block */
  enforced?: number[];
}

/** Playback state */
export interface PlaybackState {
  isPlaying: boolean;
  speed: number; // ms per step
}

/** Transport modes for isochrone visualization */
export type TransportMode = "driving" | "cycling" | "walking";

/** A grid point used as an isochrone origin */
export interface IsochroneOrigin {
  id: number;
  lat: number;
  lng: number;
}

/** GeoJSON polygon contour for a single time threshold */
export interface IsochroneContour {
  minutes: number;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

/** Isochrone data for one grid point across all speed profiles */
export interface IsochroneSet {
  grid: IsochroneOrigin[];
  profileMap: number[]; // 168 entries: slot index -> profile index (0-5)
  isochrones: Record<
    string, // grid point ID
    Record<
      string, // profile index
      Record<string, GeoJSON.Feature> // minutes -> GeoJSON Feature
    >
  >;
}

/** Isochrone interaction state */
export interface IsochroneState {
  isActive: boolean;
  origin: IsochroneOrigin | null;
  mode: TransportMode;
  maxMinutes: number; // max travel time to show (2-20, controls how many bands visible)
}

/** Bay Wheels bike share station with typical-week demand profile */
export interface StationData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  /** 168-element departure demand array (0-1, peak=1.0), indexed as (dow * 24 + hour) */
  slots: number[];
  /** 168-element arrival demand array (0-1, peak=1.0) */
  arrivals: number[];
}

/** Pre-computed bike share data loaded from bike_week.json */
export interface BikeWeekData {
  generated: string;
  dateRange: { from: string; to: string };
  stations: StationData[];
}

/** Active visualization mode */
export type ViewMode = "parking" | "bike" | "correlation";

export type { MapViewState };
