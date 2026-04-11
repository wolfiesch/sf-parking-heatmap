# SF Parking Heatmap

[![Build](https://github.com/wolfiesch/sf-parking-heatmap/actions/workflows/build.yml/badge.svg)](https://github.com/wolfiesch/sf-parking-heatmap/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A temporal heatmap of San Francisco's metered parking. Pick any day-of-week and hour, and the map shows you typical occupancy across every metered block in the city — built from ~206M meter transactions pulled directly from the SF Open Data SODA API.

**Live**: https://sfparking.wolfie.gg

![SF Parking Heatmap](public/data/screenshot.jpg)

## What it does

- **168-slot weekly profile per block**: 7 days × 24 hours of occupancy, computed from real meter sessions
- **Multi-tier visualization**: heatmap at city zoom → 3D columns at neighborhood zoom → block-level paths and individual meter dots at street zoom
- **Time playback**: scrub through the week or hit play to watch demand pulse
- **Block detail panel**: per-block hour-by-hour breakdown, supply, enforcement schedule
- **Comparison mode**: pin a reference time, see deltas vs. any other slot
- **Search + radius**: find a specific address and see what parking looks like nearby
- **Isochrone mode**: pick an origin and see how far you can drive/bike/walk in N minutes (uses local Valhalla routing — see Optional below)
- **Bike share view**: overlay Bay Wheels station demand and visualize correlation with parking pressure
- **Deeplinkable URL state**: every selection (time, view, block, search, isochrone) is in the URL, so any view is shareable

## Data sources

All data comes from public, unauthenticated endpoints. **There are no API keys to configure.**

| Source | Dataset | Used for |
|---|---|---|
| [SF Open Data SODA API](https://data.sfgov.org) | `8vzz-qzz9` (Parking Meters) | Active meter locations, block centroids |
| [SF Open Data SODA API](https://data.sfgov.org) | `imvp-dq3v` (Meter Operating Schedules and Transaction Counts) | ~206M session records aggregated into 168-slot occupancy profiles |
| [SF 311 service requests](https://data.sfgov.org) | (via SODA) | Off-hours parking pressure scores |
| Bay Wheels GBFS | bike share station status feed | Station capacity and trip data for the bike view |

The map basemap is [CARTO Dark Matter](https://carto.com/basemaps/) (open vector tiles, no token).

## Tech stack

- **Frontend**: Vite 7 + React 19 + TypeScript + Tailwind CSS v4
- **Mapping**: [deck.gl](https://deck.gl) v9 layers on top of [MapLibre GL](https://maplibre.org) via `react-map-gl`
- **Pipeline**: Python 3 standard library only — no `requirements.txt` needed
- **Routing (optional)**: [Valhalla](https://github.com/valhalla/valhalla) running locally in Docker for isochrone computation

## Setup

```bash
# 1. Install JS deps
pnpm install

# 2. Build the data (one-time, takes a few minutes)
pnpm fetch-meters          # ~28k metered blocks → public/data/meter_locations.json
pnpm fetch-enforcement     # block-level enforcement schedules
pnpm fetch-311             # 311 pressure scores
pnpm aggregate             # paginated GROUP BY over the full transaction dataset

# Or just run the whole pipeline:
pnpm pipeline

# 3. Start the dev server
pnpm dev
```

Then open http://localhost:5173.

## Project layout

```
sf-parking-heatmap/
├── public/data/        # Generated JSON consumed by the frontend (committed)
│   ├── meter_locations.json
│   ├── parking_week.json    # The 168-slot occupancy profiles (~3 MB)
│   ├── enforcement_schedules.json
│   ├── pressure_311.json
│   ├── bike_week.json       # Bay Wheels demand (optional)
│   └── isochrones/          # Pre-computed Valhalla isochrones (gitignored)
├── scripts/            # Python data pipeline
│   ├── fetch_meter_locations.py
│   ├── fetch_enforcement_schedules.py
│   ├── fetch_311_pressure.py
│   ├── fetch_parking_supply.py
│   ├── aggregate_parking.py        # paginated SODA GROUP BY → weekly profiles
│   ├── compute_block_paths.py      # PCA-aligned 2-point block geometries
│   ├── aggregate_bike_trips.py
│   ├── build_speed_profiles.py
│   └── compute_isochrones.py       # batch Valhalla calls
├── src/
│   ├── App.tsx
│   ├── components/     # Map, panels, controls, tooltips
│   ├── hooks/          # Data loading, time slot, URL state, isochrones
│   ├── layers/         # deck.gl layer factories per zoom tier
│   ├── lib/            # SODA client, color scales, geo helpers
│   └── types.ts
└── docker-compose.yml  # Optional Valhalla service for isochrones
```

## How occupancy is computed

The transaction dataset (`imvp-dq3v`) gives one row per paid session with `street_block`, `session_start_dt`, etc. The pipeline:

1. **Aggregates server-side** with `date_extract_dow()` and `date_extract_hh()` over a 90-day window — `aggregate_parking.py` makes a few paginated GROUP BY calls instead of pulling raw rows
2. **Maps SODA day-of-week** (1=Sun..7=Sat) **to ISO** (0=Mon..6=Sun)
3. **Converts session counts to occupancy ratio**: `(sessions_per_week × avg_session_hours × compliance_factor) / meter_count`, clamped to `[0, 1]`
   - `AVG_SESSION_HOURS = 1.2` (SFMTA average)
   - `COMPLIANCE_FACTOR = 1.33` (accounts for unpaid parkers)
4. **Blends in 311 pressure scores** for off-hours when meters aren't enforced

The result is a 168-element array per block (`dow * 24 + hour`) shipped as a single JSON file.

## Available scripts

```bash
pnpm dev                  # Vite dev server
pnpm build                # Production build (tsc -b && vite build)
pnpm lint                 # ESLint
pnpm preview              # Preview the built bundle

# Data pipeline
pnpm fetch-meters         # Active meter locations
pnpm fetch-enforcement    # Enforcement schedules
pnpm fetch-311            # 311 pressure data
pnpm fetch-supply         # Total parking spaces per block
pnpm compute-paths        # PCA block geometry
pnpm aggregate            # Aggregate sessions → weekly profiles
pnpm aggregate-bikes      # Bay Wheels demand profiles
pnpm pipeline             # Run the core pipeline end-to-end
pnpm pipeline-full        # Core pipeline + speed profiles + isochrones
```

## Optional: isochrones

The isochrone view (drive/bike/walk reachability from any point) needs a routing engine. The repo includes a `docker-compose.yml` for [Valhalla](https://github.com/valhalla/valhalla):

```bash
docker compose up -d           # Downloads CA OSM extract on first run
pnpm build-speed-profiles      # Cluster historical speeds into 6 profiles
pnpm compute-isochrones        # Pre-compute isochrones for the grid
```

If you don't care about isochrones, skip this — the app degrades gracefully.

## Caveats

- **Occupancy is an estimate.** It uses a fixed `AVG_SESSION_HOURS` and a `COMPLIANCE_FACTOR` for unpaid parkers. Both are tunable in `scripts/aggregate_parking.py`.
- **Only metered blocks.** Non-metered streets aren't in the dataset.
- **Typical week, not real-time.** The pipeline aggregates the trailing 90 days into a typical-week profile. There's no live feed.
- **`enforced` mask is per-block.** During non-enforced hours the heatmap blends in 311 pressure scores rather than using meter sessions.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

- [DataSF](https://datasf.org/opendata/) for publishing the meter transaction dataset
- [deck.gl](https://deck.gl), [MapLibre](https://maplibre.org), and [CARTO basemaps](https://carto.com/basemaps/) for the open mapping stack
- [Valhalla](https://github.com/valhalla/valhalla) for the routing engine
