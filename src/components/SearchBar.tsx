import { Search, X, Loader2 } from "lucide-react";
import type { GeoResult } from "../lib/geocode";
import { RADIUS_OPTIONS, type RadiusOption } from "../hooks/useSearch";

interface SearchBarProps {
  query: string;
  results: GeoResult[];
  isSearching: boolean;
  radius: RadiusOption;
  hasSelection: boolean;
  onQueryChange: (q: string) => void;
  onSelectResult: (r: GeoResult) => void;
  onClear: () => void;
  onRadiusChange: (r: RadiusOption) => void;
}

export function SearchBar({
  query,
  results,
  isSearching,
  radius,
  hasSelection,
  onQueryChange,
  onSelectResult,
  onClear,
  onRadiusChange,
}: SearchBarProps) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-80">
      {/* Search input */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search SF address..."
          className="w-full pl-9 pr-8 py-2 rounded-xl bg-gray-950/85 backdrop-blur-md border border-gray-800/50 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
        />
        {(query || hasSelection) && (
          <button
            onClick={onClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-800 transition-colors"
          >
            {isSearching ? (
              <Loader2 size={14} className="text-gray-400 animate-spin" />
            ) : (
              <X size={14} className="text-gray-400" />
            )}
          </button>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {results.length > 0 && !hasSelection && (
        <div className="mt-1 rounded-xl bg-gray-950/95 backdrop-blur-md border border-gray-800/50 overflow-hidden">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => onSelectResult(r)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800/60 transition-colors border-b border-gray-800/30 last:border-0"
            >
              <span className="text-white">{r.name}</span>
              <span className="text-[10px] text-gray-500 ml-2">{r.type}</span>
            </button>
          ))}
        </div>
      )}

      {/* Radius selector (shown when a result is selected) */}
      {hasSelection && (
        <div className="mt-1.5 flex items-center justify-center gap-1">
          <span className="text-[10px] text-gray-400 mr-1">Radius:</span>
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => onRadiusChange(r)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                radius === r
                  ? "bg-blue-500/80 text-white"
                  : "bg-gray-800/60 text-gray-400 hover:bg-gray-700/60"
              }`}
            >
              {r}m
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
