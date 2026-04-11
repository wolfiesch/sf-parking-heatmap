import { useState, useCallback, useEffect, useMemo } from "react";
import type { BlockData, StationData, TransportMode, ViewMode } from "./types";
import type { ColumnStyle } from "./layers/parkingColumnLayer";
import { useParkingData } from "./hooks/useParkingData";
import { useTimeSlot } from "./hooks/useTimeSlot";
import { useMapView } from "./hooks/useMapView";
import { useViewMode } from "./hooks/useViewMode";
import { useBikeData } from "./hooks/useBikeData";
import { getInitialUrlState, useUrlSync } from "./hooks/useUrlState";
import { buildNearestStationMap } from "./layers/correlationLayer";
import { ParkingMap } from "./components/ParkingMap";
import { TimeControl } from "./components/TimeControl";
import { WeekHeatmap } from "./components/WeekHeatmap";
import { Header } from "./components/Header";
import { Legend } from "./components/Legend";
import { BlockDetailPanel } from "./components/BlockDetailPanel";
import { StationDetailPanel } from "./components/StationDetailPanel";
import { NeighborhoodSummary } from "./components/NeighborhoodSummary";
import { SearchBar } from "./components/SearchBar";
import { SearchResults } from "./components/SearchResults";
import { ComparisonControl } from "./components/ComparisonControl";
import { IsochroneControl } from "./components/IsochroneControl";
import { ViewModeToggle } from "./components/ViewModeToggle";
import { useSearch } from "./hooks/useSearch";
import { useComparison } from "./hooks/useComparison";
import { useIsochrone } from "./hooks/useIsochrone";
import { useIsochroneData } from "./hooks/useIsochroneData";
import { createRadiusOverlayLayer } from "./layers/radiusOverlayLayer";
import { createIsochroneLayers, createBlockHighlightLayer } from "./layers/isochroneLayer";
import { IsochroneAnalysis } from "./components/IsochroneAnalysis";

/** Human-readable labels for speed profile indices */
const PROFILE_LABELS: Record<number, string> = {
  0: "AM Peak (7-10 AM)",
  1: "Midday (10 AM-4 PM)",
  2: "PM Peak (4-8 PM)",
  3: "Night (8 PM-7 AM)",
  4: "Weekend Day (8 AM-8 PM)",
  5: "Weekend Night (8 PM-8 AM)",
};

// Parse URL state once at module level (before first render)
const urlInit = getInitialUrlState();

function App() {
  const { blocks, cityAverages, cityEnforcedFraction, loading, error, generated, dateRange } = useParkingData();
  const { timeSlot, isPlaying, speed, setDow, setHour, setSlot, setSpeed, togglePlay } =
    useTimeSlot(urlInit.timeSlot);
  const { viewState, onViewStateChange, flyTo } = useMapView(urlInit.viewState);
  const [selectedBlock, setSelectedBlock] = useState<BlockData | null>(null);
  const [selectedStation, setSelectedStation] = useState<StationData | null>(null);
  const [columnStyle, setColumnStyle] = useState<ColumnStyle>("columns");
  const { mode: viewMode, setMode: setViewMode } = useViewMode(
    (urlInit.viewMode as ViewMode) ?? "parking",
  );
  const bikeData = useBikeData();
  const search = useSearch(blocks, timeSlot);
  const comparison = useComparison(urlInit.comparing, urlInit.refDow, urlInit.refHour);
  const isochrone = useIsochrone({
    initialActive: urlInit.isoActive,
    initialMode: (urlInit.isoMode as TransportMode) ?? undefined,
    initialMaxMinutes: urlInit.isoMaxMinutes ?? undefined,
  });
  const isoData = useIsochroneData();
  const [snapDistance, setSnapDistance] = useState<number | null>(null);

  // Load bike data when switching to bike or correlation mode
  const loadBikeData = bikeData.load;
  useEffect(() => {
    if (viewMode === "bike" || viewMode === "correlation") {
      loadBikeData();
    }
  }, [viewMode, loadBikeData]);

  // Pre-compute nearest station map for correlation layer (once, when both datasets loaded)
  const nearestStations = useMemo(() => {
    if (blocks.length === 0 || bikeData.stations.length === 0) return new Map<string, StationData[]>();
    return buildNearestStationMap(blocks, bikeData.stations);
  }, [blocks, bikeData.stations]);

  // Resolve station ID from URL once bike data loads
  useEffect(() => {
    if (urlInit.stationId && bikeData.stations.length > 0 && !selectedStation) {
      const found = bikeData.stations.find((s) => s.id === urlInit.stationId);
      if (found) setSelectedStation(found);
    }
  }, [bikeData.stations, selectedStation]);

  // Resolve block ID from URL once data loads
  const pendingBlockId = useMemo(() => urlInit.blockId ?? null, []);
  useEffect(() => {
    if (pendingBlockId && blocks.length > 0 && !selectedBlock) {
      const found = blocks.find((b) => b.id === pendingBlockId);
      if (found) setSelectedBlock(found);
    }
  }, [blocks, pendingBlockId, selectedBlock]);

  // Load isochrone data when mode becomes active
  const { loadMode, getGrid, getIsochrones: getIso, getProfileIndex: getProfile } = isoData;
  const { isActive: isoActive, mode: isoMode, setOrigin: isoSetOrigin, origin: isoOrigin } = isochrone;

  useEffect(() => {
    if (isoActive) {
      loadMode(isoMode);
    }
  }, [isoActive, isoMode, loadMode]);

  // Restore isochrone origin from URL once data loads
  useEffect(() => {
    if (urlInit.isoLat != null && urlInit.isoLng != null && !isoOrigin) {
      const grid = getGrid(isoMode);
      if (grid) {
        isoSetOrigin(urlInit.isoLat, urlInit.isoLng, grid);
      }
    }
  }, [getGrid, isoMode, isoOrigin, isoSetOrigin]);

  // Sync state to URL
  useUrlSync({
    timeSlot,
    viewState,
    selectedBlockId: selectedBlock?.id ?? null,
    isPlaying,
    searchLat: search.selectedResult?.lat,
    searchLng: search.selectedResult?.lng,
    searchRadius: search.selectedResult ? search.radius : undefined,
    comparing: comparison.comparing,
    refDow: comparison.referenceSlot?.dow,
    refHour: comparison.referenceSlot?.hour,
    isoActive: isochrone.isActive,
    isoMode: isochrone.mode,
    isoLat: isochrone.origin?.lat,
    isoLng: isochrone.origin?.lng,
    isoMaxMinutes: isochrone.isActive ? isochrone.maxMinutes : undefined,
    viewMode,
    selectedStationId: selectedStation?.id ?? null,
  });

  // Handle browser back/forward
  useEffect(() => {
    function handleUrlChange() {
      const s = getInitialUrlState();
      if (s.timeSlot) setSlot(s.timeSlot.dow, s.timeSlot.hour);
      if (s.blockId && blocks.length > 0) {
        const found = blocks.find((b) => b.id === s.blockId);
        if (found) setSelectedBlock(found);
      } else if (!s.blockId) {
        setSelectedBlock(null);
      }
      if (s.viewMode) {
        setViewMode(s.viewMode as ViewMode);
      }
    }
    window.addEventListener("urlstatechange", handleUrlChange);
    return () => window.removeEventListener("urlstatechange", handleUrlChange);
  }, [blocks, setSlot, setViewMode]);

  const handleBlockClick = useCallback(
    (block: BlockData | null) => {
      setSelectedBlock(block);
      if (block) {
        flyTo(block.lng, block.lat);
      }
    },
    [flyTo],
  );

  const handleStationClick = useCallback(
    (station: StationData | null) => {
      setSelectedStation(station);
      if (station) {
        flyTo(station.lng, station.lat);
      }
    },
    [flyTo],
  );

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      // Clear selections when switching modes
      if (mode === "parking") {
        setSelectedStation(null);
      } else {
        setSelectedBlock(null);
      }
    },
    [setViewMode],
  );

  // Handle isochrone map click: snap to nearest grid point
  const handleMapClick = useCallback(
    (coordinate: [number, number]) => {
      if (!isoActive) return;
      const grid = getGrid(isoMode);
      if (!grid) return;
      // coordinate is [lng, lat]
      const dist = isoSetOrigin(coordinate[1], coordinate[0], grid);
      setSnapDistance(dist ?? null);
    },
    [isoActive, isoMode, isoSetOrigin, getGrid],
  );

  // Handle search result selection: fly to location
  const handleSearchSelect = useCallback(
    (result: { lat: number; lng: number; name: string; type: string }) => {
      search.selectResult(result);
      flyTo(result.lng, result.lat, 15);
    },
    [search.selectResult, flyTo],
  );

  // Build extra layers for search radius + isochrones
  const profileIndex = useMemo(
    () => getProfile(isoMode, timeSlot.dow, timeSlot.hour),
    [getProfile, isoMode, timeSlot.dow, timeSlot.hour],
  );

  const currentContours = useMemo(() => {
    if (!isoActive || !isoOrigin) return null;
    return getIso(isoMode, isoOrigin.id, profileIndex);
  }, [isoActive, isoOrigin, isoMode, profileIndex, getIso]);

  // Quantize zoom to a boolean tier so isochrone layers don't rebuild on every zoom frame
  const isoZoomMajorOnly = viewState.zoom < 12;

  const isochroneContourLayers = useMemo(() => {
    if (!isoActive || !isoOrigin || !currentContours) return [];
    return createIsochroneLayers(
      currentContours, isoMode, isochrone.maxMinutes, isoOrigin, isoZoomMajorOnly ? 11 : 13,
    );
  }, [isoActive, isoOrigin, isoMode, isochrone.maxMinutes, currentContours, isoZoomMajorOnly]);

  // Block highlights are expensive (point-in-polygon per block) - separate memo, no zoom dep.
  // Hidden at heatmap zoom since individual blocks aren't visible there anyway.
  const isochroneHighlightLayer = useMemo(() => {
    if (!isoActive || !isoOrigin || !currentContours || isoZoomMajorOnly) return null;
    return createBlockHighlightLayer(blocks, currentContours, isochrone.maxMinutes);
  }, [isoActive, isoOrigin, currentContours, isochrone.maxMinutes, blocks, isoZoomMajorOnly]);

  const isochroneExtraLayers = useMemo(() => {
    const layers = [...isochroneContourLayers];
    if (isochroneHighlightLayer) layers.push(isochroneHighlightLayer);
    return layers;
  }, [isochroneContourLayers, isochroneHighlightLayer]);

  const searchExtraLayers = useMemo(() => {
    if (!search.selectedResult) return [];
    return [createRadiusOverlayLayer(
      { lat: search.selectedResult.lat, lng: search.selectedResult.lng },
      search.radius,
    )];
  }, [search.selectedResult, search.radius]);

  const extraLayers = useMemo(
    () => [...searchExtraLayers, ...isochroneExtraLayers],
    [searchExtraLayers, isochroneExtraLayers],
  );

  const handleWeekCellClick = useCallback(
    (dow: number, hour: number) => {
      setSlot(dow, hour);
    },
    [setSlot],
  );

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">Failed to load parking data</p>
          <p className="text-gray-500 text-sm">{error}</p>
          <p className="text-gray-600 text-xs mt-4">
            Run <code className="bg-gray-800 px-1.5 py-0.5 rounded">python3 scripts/aggregate_parking.py</code> to generate data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-950">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-2">
              SF Parking <span className="font-light text-gray-400">Heatmap</span>
            </h1>
            <p className="text-gray-500 text-sm">Loading parking data...</p>
          </div>
        </div>
      )}

      {/* Map */}
      <ParkingMap
        blocks={blocks}
        timeSlot={timeSlot}
        selectedBlockId={selectedBlock?.id ?? null}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        onBlockClick={handleBlockClick}
        onMapClick={isochrone.isActive ? handleMapClick : undefined}
        extraLayers={extraLayers}
        comparing={comparison.comparing}
        referenceSlot={comparison.referenceSlot}
        columnStyle={columnStyle}
        viewMode={viewMode}
        stations={bikeData.stations}
        selectedStationId={selectedStation?.id ?? null}
        onStationClick={handleStationClick}
        nearestStations={nearestStations}
      />

      {/* Search */}
      <SearchBar
        query={search.query}
        results={search.results}
        isSearching={search.isSearching}
        radius={search.radius}
        hasSelection={search.selectedResult !== null}
        onQueryChange={search.setQuery}
        onSelectResult={handleSearchSelect}
        onClear={search.clearSearch}
        onRadiusChange={search.setRadius}
      />

      {/* Isochrone control */}
      <IsochroneControl
        isActive={isochrone.isActive}
        origin={isochrone.origin}
        mode={isochrone.mode}
        maxMinutes={isochrone.maxMinutes}
        loading={isoData.loading}
        snapDistance={snapDistance}
        profileName={PROFILE_LABELS[profileIndex] ?? null}
        onToggleActive={isochrone.toggleActive}
        onModeChange={isochrone.setMode}
        onMaxMinutesChange={isochrone.setMaxMinutes}
        onClearOrigin={isochrone.clearOrigin}
      >
        {isochrone.origin && currentContours && (
          <IsochroneAnalysis
            blocks={blocks}
            timeSlot={timeSlot}
            contours={currentContours}
            maxMinutes={isochrone.maxMinutes}
            origin={isochrone.origin}
          />
        )}
      </IsochroneControl>

      {/* Nearby blocks panel */}
      {search.selectedResult && (
        <SearchResults
          blocks={search.nearbyBlocks}
          timeSlot={timeSlot}
          onBlockClick={handleBlockClick}
        />
      )}

      {/* UI overlays */}
      <Header
        generated={viewMode === "bike" ? bikeData.generated : generated}
        dateRange={viewMode === "bike" ? bikeData.dateRange : dateRange}
        blockCount={viewMode === "bike" ? bikeData.stations.length : blocks.length}
      />

      {/* View mode toggle */}
      <div className="absolute top-16 left-4 z-20">
        <ViewModeToggle mode={viewMode} onModeChange={handleViewModeChange} />
      </div>

      {!isochrone.isActive && viewMode === "parking" && (
        <NeighborhoodSummary blocks={blocks} timeSlot={timeSlot} />
      )}

      <WeekHeatmap
        cityAverages={cityAverages}
        cityEnforcedFraction={cityEnforcedFraction}
        timeSlot={timeSlot}
        onCellClick={handleWeekCellClick}
        viewMode={viewMode}
        bikeCityAverages={bikeData.cityAverages}
      />

      <Legend
        is3D={viewState.zoom >= 13 && viewState.zoom < 15.5}
        comparing={comparison.comparing}
        columnStyle={columnStyle}
        onColumnStyleChange={setColumnStyle}
        isochroneActive={isochrone.isActive && isochrone.origin !== null}
        isochroneMode={isochrone.mode}
        viewMode={viewMode}
      />

      {/* Comparison note: zoom in for delta view when at heatmap level */}
      {comparison.comparing && viewState.zoom < 13 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-[11px] text-purple-300">
          Zoom in to see delta visualization
        </div>
      )}

      <TimeControl
        timeSlot={timeSlot}
        isPlaying={isPlaying}
        speed={speed}
        onDowChange={setDow}
        onHourChange={setHour}
        onTogglePlay={togglePlay}
        onSpeedChange={setSpeed}
      >
        <ComparisonControl
          comparing={comparison.comparing}
          referenceSlot={comparison.referenceSlot}
          currentSlot={timeSlot}
          onPin={() => comparison.pinReference(timeSlot)}
          onExit={comparison.exitComparison}
        />
      </TimeControl>

      {/* Detail panels */}
      <BlockDetailPanel
        block={viewMode === "parking" || viewMode === "correlation" ? selectedBlock : null}
        timeSlot={timeSlot}
        onClose={() => setSelectedBlock(null)}
        comparing={comparison.comparing}
        referenceSlot={comparison.referenceSlot}
      />
      <StationDetailPanel
        station={viewMode === "bike" ? selectedStation : null}
        timeSlot={timeSlot}
        onClose={() => setSelectedStation(null)}
      />
    </div>
  );
}

export default App;
