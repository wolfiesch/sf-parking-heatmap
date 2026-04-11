import { useCallback, useMemo } from "react";
import { Map } from "react-map-gl/maplibre";
import { DeckGL } from "@deck.gl/react";
import type { Layer, PickingInfo, MapViewState } from "deck.gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { BlockData, StationData, TimeSlot, ViewMode } from "../types";
import { createParkingHeatmapLayer } from "../layers/parkingHeatmapLayer";
import { createParkingColumnLayer } from "../layers/parkingColumnLayer";
import type { ColumnStyle } from "../layers/parkingColumnLayer";
import { createParkingDeltaColumnLayer } from "../layers/parkingDeltaColumnLayer";
import { createParkingPathLayers } from "../layers/parkingPathLayer";
import { createParkingDeltaPathLayers } from "../layers/parkingDeltaPathLayer";
import { createMeterDotsLayer } from "../layers/meterDotsLayer";
import { createBikeHeatmapLayer } from "../layers/bikeHeatmapLayer";
import { createBikeScatterLayer } from "../layers/bikeScatterLayer";
import { createCorrelationLayer } from "../layers/correlationLayer";
import { getBlockTooltipContent, getDeltaTooltipContent } from "./BlockTooltip";
import { getStationTooltipContent, getCorrelationTooltipContent } from "./BikeTooltip";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Zoom tier boundaries
const COLUMN_ZOOM_MIN = 13;
const SCATTER_ZOOM_MIN = 15.5;
const METER_DOTS_ZOOM_MIN = 18;

type ZoomTier = "heatmap" | "columns" | "scatter";

function getZoomTier(zoom: number): ZoomTier {
  if (zoom >= SCATTER_ZOOM_MIN) return "scatter";
  if (zoom >= COLUMN_ZOOM_MIN) return "columns";
  return "heatmap";
}

interface ParkingMapProps {
  blocks: BlockData[];
  timeSlot: TimeSlot;
  selectedBlockId: string | null;
  viewState: MapViewState;
  onViewStateChange: (vs: MapViewState) => void;
  onBlockClick: (block: BlockData | null) => void;
  onMapClick?: (coordinate: [number, number]) => void;
  extraLayers?: Layer[];
  comparing?: boolean;
  referenceSlot?: TimeSlot | null;
  columnStyle?: ColumnStyle;
  viewMode?: ViewMode;
  stations?: StationData[];
  selectedStationId?: string | null;
  onStationClick?: (station: StationData | null) => void;
  nearestStations?: Map<string, StationData[]>;
}

export function ParkingMap({
  blocks,
  timeSlot,
  selectedBlockId,
  viewState,
  onViewStateChange,
  onBlockClick,
  onMapClick,
  extraLayers,
  comparing,
  referenceSlot,
  columnStyle = "hexgrid",
  viewMode = "parking",
  stations = [],
  selectedStationId,
  onStationClick,
  nearestStations,
}: ParkingMapProps) {
  const zoom = viewState.zoom;
  const tier = getZoomTier(zoom);

  // Pre-split blocks by path availability once (stable references for deck.gl)
  const withPath = useMemo(
    () => blocks.filter((b) => b.path && b.path.length >= 2),
    [blocks],
  );
  const withoutPath = useMemo(
    () => blocks.filter((b) => !b.path || b.path.length < 2),
    [blocks],
  );

  const showMeterDots = zoom >= METER_DOTS_ZOOM_MIN;

  // Memoize layers so they aren't recreated on every pan/zoom frame
  const dataLayers = useMemo(() => {
    const layers: Layer[] = [];

    if (viewMode === "bike") {
      // Bike mode: heatmap at low zoom, scatter at mid+
      if (tier === "heatmap") {
        layers.push(createBikeHeatmapLayer(stations, timeSlot));
      } else {
        layers.push(createBikeScatterLayer(stations, timeSlot, selectedStationId ?? null));
      }
      return layers;
    }

    if (viewMode === "correlation") {
      // Correlation mode: parking layers as base + correlation overlay
      if (tier === "scatter") {
        layers.push(...createParkingPathLayers(withPath, withoutPath, timeSlot, selectedBlockId));
      } else if (tier === "columns") {
        layers.push(...createParkingColumnLayer(blocks, timeSlot, selectedBlockId, columnStyle));
      } else {
        layers.push(createParkingHeatmapLayer(blocks, timeSlot));
      }
      // Add correlation overlay if we have station data
      if (nearestStations && nearestStations.size > 0) {
        layers.push(createCorrelationLayer(blocks, timeSlot, nearestStations));
      }
      return layers;
    }

    // Parking mode (default)
    if (comparing && referenceSlot) {
      if (tier === "scatter") {
        layers.push(...createParkingDeltaPathLayers(withPath, withoutPath, timeSlot, referenceSlot, selectedBlockId));
      } else if (tier === "columns") {
        layers.push(createParkingDeltaColumnLayer(blocks, timeSlot, referenceSlot, selectedBlockId));
      } else {
        layers.push(createParkingHeatmapLayer(blocks, timeSlot));
      }
    } else {
      if (tier === "scatter") {
        layers.push(...createParkingPathLayers(withPath, withoutPath, timeSlot, selectedBlockId));
      } else if (tier === "columns") {
        layers.push(...createParkingColumnLayer(blocks, timeSlot, selectedBlockId, columnStyle));
      } else {
        layers.push(createParkingHeatmapLayer(blocks, timeSlot));
      }
    }

    // Add individual meter dots at deep zoom
    if (showMeterDots) {
      layers.push(createMeterDotsLayer(blocks, timeSlot));
    }

    return layers;
  }, [blocks, withPath, withoutPath, tier, timeSlot, selectedBlockId, comparing, referenceSlot, showMeterDots, columnStyle, viewMode, stations, selectedStationId, nearestStations]);

  const layers = useMemo(
    () => [...dataLayers, ...(extraLayers ?? [])],
    [dataLayers, extraLayers],
  );

  const handleClick = useCallback(
    (info: PickingInfo) => {
      if (info.object) {
        if (viewMode === "bike" && onStationClick) {
          onStationClick(info.object as StationData);
        } else {
          onBlockClick(info.object as BlockData);
        }
      } else if (onMapClick && info.coordinate) {
        onMapClick(info.coordinate as [number, number]);
      } else {
        if (viewMode === "bike" && onStationClick) {
          onStationClick(null);
        } else {
          onBlockClick(null);
        }
      }
    },
    [onBlockClick, onMapClick, onStationClick, viewMode],
  );

  const getTooltip = useCallback(
    (info: PickingInfo) => {
      if (!info.object) return null;
      if (viewMode === "bike") {
        return getStationTooltipContent(info.object as StationData, timeSlot);
      }
      if (viewMode === "correlation") {
        const block = info.object as BlockData;
        const nearby = nearestStations?.get(block.id);
        return getCorrelationTooltipContent(block, nearby, timeSlot);
      }
      if (comparing && referenceSlot) {
        return getDeltaTooltipContent(info.object as BlockData, timeSlot, referenceSlot);
      }
      return getBlockTooltipContent(info.object as BlockData, timeSlot);
    },
    [timeSlot, comparing, referenceSlot, viewMode, nearestStations],
  );

  return (
    <DeckGL
      viewState={viewState}
      onViewStateChange={({ viewState: vs }) =>
        onViewStateChange(vs as MapViewState)
      }
      layers={layers}
      onClick={handleClick}
      getTooltip={getTooltip}
      controller
    >
      <Map mapStyle={MAP_STYLE} />
    </DeckGL>
  );
}
