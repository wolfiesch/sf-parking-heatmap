import { MapPin } from "lucide-react";

interface HeaderProps {
  generated: string | null;
  dateRange: { from: string; to: string } | null;
  blockCount: number;
}

export function Header({ generated, dateRange, blockCount }: HeaderProps) {
  const freshness = generated
    ? new Date(generated).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-gray-950/80 backdrop-blur-md px-4 py-2.5 border border-gray-800/50">
        <MapPin size={20} className="text-blue-400" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight leading-tight">
            SF Parking <span className="font-light text-gray-400">Heatmap</span>
          </h1>
          <p className="text-xs text-gray-500">
            {blockCount > 0 && `${blockCount.toLocaleString()} blocks`}
            {dateRange && ` - ${dateRange.from} to ${dateRange.to}`}
          </p>
        </div>
      </div>

      {freshness && (
        <div className="pointer-events-auto rounded-lg bg-gray-950/80 backdrop-blur-md px-3 py-1.5 border border-gray-800/50 text-xs text-gray-400">
          Updated {freshness}
        </div>
      )}
    </header>
  );
}
