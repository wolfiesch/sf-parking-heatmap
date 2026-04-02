import { useState, useCallback, useEffect, useMemo } from "react";
import type { BlockData } from "./types";
import type { ColumnStyle } from "./layers/parkingColumnLayer";
import { useParkingData } from "./hooks/useParkingData";
import { useTimeSlot } from "./hooks/useTimeSlot";
import { useMapView } from "./hooks/useMapView";
import { getInitialUrlState, useUrlSync } from "./hooks/useUrlState";
import { ParkingMap } from "./components/ParkingMap";
import { TimeControl } from "./components/TimeControl";
import { WeekHeatmap } from "./components/WeekHeatmap";
import { Header } from "./components/Header";
import { Legend } from "./components/Legend";
import { BlockDetailPanel } from "./components/BlockDetailPanel";
import { NeighborhoodSummary } from "./components/NeighborhoodSummary";
import { SearchBar } from "./components/SearchBar";
import { SearchResults } from "./components/SearchResults";
import { ComparisonControl } from "./components/ComparisonControl";
import { useSearch } from "./hooks/useSearch";
import { useComparison } from "./hooks/useComparison";
import { createRadiusOverlayLayer } from "./layers/radiusOverlayLayer";

// Parse URL state once at module level (before first render)
const urlInit = getInitialUrlState();

function App() {
  const { blocks, cityAverages, cityEnforcedFraction, loading, error, generated, dateRange } = useParkingData();
  const { timeSlot, isPlaying, speed, setDow, setHour, setSlot, setSpeed, togglePlay } =
    useTimeSlot(urlInit.timeSlot);
  const { viewState, onViewStateChange, flyTo } = useMapView(urlInit.viewState);
  const [selectedBlock, setSelectedBlock] = useState<BlockData | null>(null);
  const [columnStyle, setColumnStyle] = useState<ColumnStyle>("hexgrid");
  const search = useSearch(blocks, timeSlot);
  const comparison = useComparison(urlInit.comparing, urlInit.refDow, urlInit.refHour);

  // Resolve block ID from URL once data loads
  const pendingBlockId = useMemo(() => urlInit.blockId ?? null, []);
  useEffect(() => {
    if (pendingBlockId && blocks.length > 0 && !selectedBlock) {
      const found = blocks.find((b) => b.id === pendingBlockId);
      if (found) setSelectedBlock(found);
    }
  }, [blocks, pendingBlockId, selectedBlock]);

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
    }
    window.addEventListener("urlstatechange", handleUrlChange);
    return () => window.removeEventListener("urlstatechange", handleUrlChange);
  }, [blocks, setSlot]);

  const handleBlockClick = useCallback(
    (block: BlockData | null) => {
      setSelectedBlock(block);
      if (block) {
        flyTo(block.lng, block.lat);
      }
    },
    [flyTo],
  );

  // Handle search result selection: fly to location
  const handleSearchSelect = useCallback(
    (result: { lat: number; lng: number; name: string; type: string }) => {
      search.selectResult(result);
      flyTo(result.lng, result.lat, 15);
    },
    [search.selectResult, flyTo],
  );

  // Build extra layers for search radius
  const searchExtraLayers = useMemo(() => {
    if (!search.selectedResult) return [];
    return [createRadiusOverlayLayer(
      { lat: search.selectedResult.lat, lng: search.selectedResult.lng },
      search.radius,
    )];
  }, [search.selectedResult, search.radius]);

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
        extraLayers={searchExtraLayers}
        comparing={comparison.comparing}
        referenceSlot={comparison.referenceSlot}
        columnStyle={columnStyle}
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
        generated={generated}
        dateRange={dateRange}
        blockCount={blocks.length}
      />

      <NeighborhoodSummary blocks={blocks} timeSlot={timeSlot} />

      <WeekHeatmap
        cityAverages={cityAverages}
        cityEnforcedFraction={cityEnforcedFraction}
        timeSlot={timeSlot}
        onCellClick={handleWeekCellClick}
      />

      <Legend
        is3D={viewState.zoom >= 13 && viewState.zoom < 15.5}
        comparing={comparison.comparing}
        columnStyle={columnStyle}
        onColumnStyleChange={setColumnStyle}
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

      {/* Detail panel */}
      <BlockDetailPanel
        block={selectedBlock}
        timeSlot={timeSlot}
        onClose={() => setSelectedBlock(null)}
        comparing={comparison.comparing}
        referenceSlot={comparison.referenceSlot}
      />
    </div>
  );
}

export default App;
