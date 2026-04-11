#!/usr/bin/env python3
"""
Aggregate Bay Wheels bike share trips into typical-week demand profiles.

Downloads GBFS station metadata (filtered to SF) and recent trip CSVs,
then produces 168-slot departure/arrival demand profiles per station.

Data sources:
  - GBFS station info: https://gbfs.lyft.com/gbfs/2.3/bay/en/station_information.json
  - Trip CSVs: https://s3.amazonaws.com/baywheels-data/YYYYMM-baywheels-tripdata.csv.zip

Output: public/data/bike_week.json

Usage: python3 scripts/aggregate_bike_trips.py [--months 3]
"""

import csv
import io
import json
import sys
import time
import urllib.request
import zipfile
from argparse import ArgumentParser
from datetime import datetime, timezone
from pathlib import Path


GBFS_STATION_URL = "https://gbfs.lyft.com/gbfs/2.3/bay/en/station_information.json"
TRIP_CSV_BASE = "https://s3.amazonaws.com/baywheels-data"

# SF bounding box (generous)
SF_LAT_MIN, SF_LAT_MAX = 37.70, 37.82
SF_LNG_MIN, SF_LNG_MAX = -122.52, -122.35


def parse_args():
    p = ArgumentParser(description="Aggregate Bay Wheels bike trips by station/dow/hour")
    p.add_argument("--months", type=int, default=3, help="Number of months of CSVs to download")
    return p.parse_args()


def fetch_stations():
    """Fetch GBFS station metadata, filter to SF stations."""
    print("Fetching GBFS station metadata...")
    req = urllib.request.Request(GBFS_STATION_URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())

    all_stations = data.get("data", {}).get("stations", [])
    print(f"  Total Bay Area stations: {len(all_stations)}")

    sf_stations = {}
    for s in all_stations:
        lat = s.get("lat", 0)
        lon = s.get("lon", 0)
        if SF_LAT_MIN <= lat <= SF_LAT_MAX and SF_LNG_MIN <= lon <= SF_LNG_MAX:
            sid = s.get("short_name") or s.get("station_id", "")
            sf_stations[sid] = {
                "id": sid,
                "name": s.get("name", ""),
                "lat": round(lat, 6),
                "lng": round(lon, 6),
                "capacity": s.get("capacity", 0),
            }

    # Also index by station_id (numeric) for CSV join
    id_to_short = {}
    for s in all_stations:
        short = s.get("short_name", "")
        sid = s.get("station_id", "")
        if short in sf_stations:
            id_to_short[sid] = short
            id_to_short[short] = short
        # Also map by name for fuzzy fallback
        name = s.get("name", "")
        if short in sf_stations and name:
            id_to_short[name] = short

    print(f"  SF stations: {len(sf_stations)}")
    return sf_stations, id_to_short


def get_csv_urls(months):
    """Generate CSV zip URLs for the last N months (starting 2 months back since CSVs lag)."""
    now = datetime.now(timezone.utc)
    urls = []
    year, month = now.year, now.month

    # Start 2 months back (CSVs are published ~1-2 months behind)
    for _ in range(2):
        month -= 1
        if month < 1:
            month = 12
            year -= 1

    for _ in range(months):
        ym = f"{year}{month:02d}"
        url = f"{TRIP_CSV_BASE}/{ym}-baywheels-tripdata.csv.zip"
        urls.append((ym, url))
        month -= 1
        if month < 1:
            month = 12
            year -= 1

    urls.reverse()  # oldest first
    return urls


def process_csv_zip(url, ym, id_to_short, station_departures, station_arrivals):
    """Download and process a single month's trip CSV."""
    print(f"  Downloading {ym}...")
    start = time.time()

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "sf-parking-heatmap/1.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            zip_bytes = resp.read()
    except Exception as e:
        print(f"    Failed to download {ym}: {e}")
        return 0

    elapsed_dl = time.time() - start
    size_mb = len(zip_bytes) / (1024 * 1024)
    print(f"    Downloaded {size_mb:.1f} MB in {elapsed_dl:.1f}s")

    trip_count = 0
    matched = 0

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for name in zf.namelist():
            if not name.endswith(".csv"):
                continue

            with zf.open(name) as csvfile:
                reader = csv.DictReader(io.TextIOWrapper(csvfile, encoding="utf-8", errors="replace"))
                for row in reader:
                    trip_count += 1

                    # Parse timestamp
                    started_at = row.get("started_at", "")
                    if not started_at:
                        continue

                    try:
                        dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                    except ValueError:
                        try:
                            dt = datetime.strptime(started_at, "%Y-%m-%d %H:%M:%S")
                        except ValueError:
                            continue

                    # ISO dow: Monday=0..Sunday=6
                    dow = dt.weekday()
                    hour = dt.hour
                    slot_idx = dow * 24 + hour

                    # Match start station
                    start_id = row.get("start_station_id", "")
                    start_name = row.get("start_station_name", "")
                    start_short = id_to_short.get(start_id) or id_to_short.get(start_name)

                    if start_short:
                        matched += 1
                        if start_short not in station_departures:
                            station_departures[start_short] = [0] * 168
                        station_departures[start_short][slot_idx] += 1

                    # Match end station
                    end_id = row.get("end_station_id", "")
                    end_name = row.get("end_station_name", "")
                    end_short = id_to_short.get(end_id) or id_to_short.get(end_name)

                    if end_short:
                        if end_short not in station_arrivals:
                            station_arrivals[end_short] = [0] * 168
                        station_arrivals[end_short][slot_idx] += 1

    elapsed = time.time() - start
    match_pct = (matched / trip_count * 100) if trip_count > 0 else 0
    print(f"    Processed {trip_count:,} trips, {matched:,} matched ({match_pct:.0f}%) in {elapsed:.1f}s")
    return trip_count


def normalize_demand(raw_counts, weeks):
    """Normalize raw trip counts to 0-1 demand scale (per station peak = 1.0)."""
    # First convert to trips per week
    per_week = [c / weeks for c in raw_counts]

    peak = max(per_week)
    if peak <= 0:
        return [0.0] * 168

    return [round(v / peak, 3) for v in per_week]


def validate_output(stations):
    """Sanity-check the output data."""
    if not stations:
        print("ERROR: No stations produced!", file=sys.stderr)
        return False

    all_demand = [s for st in stations for s in st["slots"] if s > 0]
    if not all_demand:
        print("WARNING: All demand values are zero", file=sys.stderr)
        return True

    avg_demand = sum(all_demand) / len(all_demand)
    nonzero_pct = len(all_demand) / (len(stations) * 168) * 100

    print(f"\nValidation:")
    print(f"  Stations with data: {len(stations)}")
    print(f"  Non-zero slots: {len(all_demand)} ({nonzero_pct:.1f}%)")
    print(f"  Avg demand (non-zero): {avg_demand:.3f}")

    # Spot-check: Tue 8am (commute) vs Sun 3am
    tue_8am = [st["slots"][1 * 24 + 8] for st in stations if st["slots"][1 * 24 + 8] > 0]
    sun_3am = [st["slots"][6 * 24 + 3] for st in stations if st["slots"][6 * 24 + 3] > 0]

    if tue_8am:
        print(f"  Tue 8am avg demand: {sum(tue_8am)/len(tue_8am):.3f} ({len(tue_8am)} stations)")
    if sun_3am:
        print(f"  Sun 3am avg demand: {sum(sun_3am)/len(sun_3am):.3f} ({len(sun_3am)} stations)")

    return True


def main():
    args = parse_args()

    out_dir = Path(__file__).parent.parent / "public" / "data"
    out_path = out_dir / "bike_week.json"
    out_dir.mkdir(parents=True, exist_ok=True)

    sf_stations, id_to_short = fetch_stations()

    csv_urls = get_csv_urls(args.months)
    print(f"\nDownloading {len(csv_urls)} months of trip data...")

    station_departures: dict[str, list[int]] = {}
    station_arrivals: dict[str, list[int]] = {}
    total_trips = 0
    date_min = csv_urls[0][0] if csv_urls else ""
    date_max = csv_urls[-1][0] if csv_urls else ""

    for ym, url in csv_urls:
        count = process_csv_zip(url, ym, id_to_short, station_departures, station_arrivals)
        total_trips += count

    print(f"\nTotal trips processed: {total_trips:,}")
    print(f"Stations with departures: {len(station_departures)}")
    print(f"Stations with arrivals: {len(station_arrivals)}")

    # Calculate weeks covered
    weeks = args.months * 4.33  # approximate

    # Build output
    results = []
    for sid, info in sf_stations.items():
        raw_deps = station_departures.get(sid, [0] * 168)
        raw_arrs = station_arrivals.get(sid, [0] * 168)

        dep_demand = normalize_demand(raw_deps, weeks)
        arr_demand = normalize_demand(raw_arrs, weeks)

        # Skip stations with zero activity
        if max(dep_demand) == 0 and max(arr_demand) == 0:
            continue

        results.append({
            "id": info["id"],
            "name": info["name"],
            "lat": info["lat"],
            "lng": info["lng"],
            "capacity": info["capacity"],
            "slots": dep_demand,
            "arrivals": arr_demand,
        })

    results.sort(key=lambda x: x["id"])

    if not validate_output(results):
        sys.exit(1)

    # Date range from YYYYMM strings
    from_date = f"{date_min[:4]}-{date_min[4:]}-01" if date_min else ""
    to_date = f"{date_max[:4]}-{date_max[4:]}-28" if date_max else ""

    output = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "dateRange": {"from": from_date, "to": to_date},
        "stations": results,
    }

    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"\nWrote {out_path} ({size_kb:.0f} KB, {len(results)} stations)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
