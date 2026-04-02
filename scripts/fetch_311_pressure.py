#!/usr/bin/env python3
"""
Fetch 311 parking complaints and compute per-block pressure scores.

Dataset: vw6y-z8j6 (SF 311 Cases)
Output: public/data/pressure_311.json

For each block, produces a 168-element array of pressure scores (0-1)
derived from geolocated parking enforcement complaints. Used to fill
non-enforced hours where meter data is unavailable.

Spatial join: each complaint is matched to the nearest block centroid
within 100m. Weighted by violation severity.

Usage: python3 scripts/fetch_311_pressure.py [--days 90]
"""

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from argparse import ArgumentParser
from datetime import datetime, timedelta, timezone
from pathlib import Path

SODA_BASE = "https://data.sfgov.org/resource"
DATASET = "vw6y-z8j6"
PAGE_SIZE = 50000

# At SF latitude (~37.77): 100m ~ 0.0009 lat, 0.0012 lng
MAX_DIST_LAT = 0.0009
MAX_DIST_LNG = 0.0012

# Violation subtype weights
SUBTYPE_WEIGHTS = {
    "double_parking": 3.0,
    "blocking_driveway": 2.0,
    "parking_on_sidewalk": 2.0,
}
DEFAULT_WEIGHT = 1.0

# SODA date_extract_dow: 1=Sun..7=Sat -> ISO: 0=Mon..6=Sun
SODA_DOW_TO_ISO = {1: 6, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5}


def parse_args():
    p = ArgumentParser(description="Compute parking pressure from 311 complaints")
    p.add_argument("--days", type=int, default=90, help="Lookback window in days")
    return p.parse_args()


def load_block_centroids(path):
    """Load block centroids from meter_locations.json."""
    with open(path) as f:
        blocks = json.load(f)
    return [(b["id"], b["lat"], b["lng"]) for b in blocks]


def fetch_complaints(since_date):
    """Fetch geolocated parking enforcement complaints."""
    all_rows = []
    offset = 0

    where = (
        f"service_name='Parking Enforcement' "
        f"AND requested_datetime>'{since_date}' "
        f"AND lat IS NOT NULL"
    )

    while True:
        params = urllib.parse.urlencode({
            "$select": "lat,long,service_subtype,"
                       "date_extract_dow(requested_datetime) as dow,"
                       "date_extract_hh(requested_datetime) as hour",
            "$where": where,
            "$limit": PAGE_SIZE,
            "$offset": offset,
        })
        url = f"{SODA_BASE}/{DATASET}.json?{params}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})

        start = time.time()
        with urllib.request.urlopen(req, timeout=120) as resp:
            rows = json.loads(resp.read().decode())
        elapsed = time.time() - start

        all_rows.extend(rows)
        print(f"  Page {offset // PAGE_SIZE + 1}: {len(rows)} rows ({elapsed:.1f}s)")

        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return all_rows


def get_subtype_weight(subtype):
    """Get weight multiplier for a complaint subtype."""
    if not subtype:
        return DEFAULT_WEIGHT
    subtype_lower = subtype.lower().replace(" ", "_")
    for key, weight in SUBTYPE_WEIGHTS.items():
        if key in subtype_lower:
            return weight
    return DEFAULT_WEIGHT


def spatial_join(complaints, block_centroids):
    """
    Match each complaint to nearest block centroid within 100m.
    Returns dict: block_id -> list of (iso_dow, hour, weight).
    """
    block_complaints = {}
    matched = 0
    unmatched = 0

    for comp in complaints:
        try:
            clat = float(comp["lat"])
            clng = float(comp["long"])
            soda_dow = int(comp["dow"])
            hour = int(comp["hour"])
        except (ValueError, TypeError, KeyError):
            unmatched += 1
            continue

        iso_dow = SODA_DOW_TO_ISO.get(soda_dow)
        if iso_dow is None or not (0 <= hour <= 23):
            unmatched += 1
            continue

        weight = get_subtype_weight(comp.get("service_subtype"))

        # Find nearest block centroid with bounding-box early exit
        best_block = None
        best_dist = float("inf")

        for block_id, blat, blng in block_centroids:
            dlat = abs(clat - blat)
            if dlat > MAX_DIST_LAT:
                continue
            dlng = abs(clng - blng)
            if dlng > MAX_DIST_LNG:
                continue

            dist = math.sqrt(dlat * dlat + dlng * dlng)
            if dist < best_dist:
                best_dist = dist
                best_block = block_id

        if best_block:
            matched += 1
            if best_block not in block_complaints:
                block_complaints[best_block] = []
            block_complaints[best_block].append((iso_dow, hour, weight))
        else:
            unmatched += 1

    print(f"  Matched {matched} complaints to blocks, {unmatched} unmatched")
    return block_complaints


def compute_pressure_scores(block_complaints, weeks):
    """
    Compute per-block 168-slot pressure scores normalized to 0-1.
    Uses percentile mapping for normalization.
    """
    # Step 1: Compute raw weighted counts per block per slot
    raw_counts = {}
    for block_id, entries in block_complaints.items():
        counts = [0.0] * 168
        for iso_dow, hour, weight in entries:
            idx = iso_dow * 24 + hour
            counts[idx] += weight
        # Normalize by weeks to get per-week rate
        raw_counts[block_id] = [c / weeks for c in counts]

    # Step 2: Interpolate Saturday (iso_dow=5) from Fri (4) and Sun (6)
    for block_id, counts in raw_counts.items():
        for hour in range(24):
            fri_idx = 4 * 24 + hour
            sat_idx = 5 * 24 + hour
            sun_idx = 6 * 24 + hour
            if counts[sat_idx] == 0:
                avg = (counts[fri_idx] + counts[sun_idx]) / 2
                counts[sat_idx] = avg

    # Step 3: Collect all non-zero values for percentile calculation
    all_nonzero = []
    for counts in raw_counts.values():
        for v in counts:
            if v > 0:
                all_nonzero.append(v)

    if not all_nonzero:
        print("  Warning: No non-zero pressure values found")
        return {}

    all_nonzero.sort()
    n = len(all_nonzero)
    p50 = all_nonzero[int(n * 0.50)]
    p75 = all_nonzero[int(n * 0.75)]
    p90 = all_nonzero[min(int(n * 0.90), n - 1)]

    print(f"  Percentiles: p50={p50:.3f}, p75={p75:.3f}, p90={p90:.3f}")

    def percentile_score(v):
        if v <= 0:
            return 0.0
        if v < p50:
            return 0.1 + 0.2 * (v / p50)
        if v < p75:
            return 0.3 + 0.3 * ((v - p50) / (p75 - p50)) if p75 > p50 else 0.3
        if v < p90:
            return 0.6 + 0.2 * ((v - p75) / (p90 - p75)) if p90 > p75 else 0.6
        return min(1.0, 0.8 + 0.2 * ((v - p90) / (p90 * 0.5 + 0.001)))

    # Step 4: Compute global averages for fallback (no per-hood info here)
    global_counts = [0.0] * 168
    global_blocks = [0] * 168
    for counts in raw_counts.values():
        for i in range(168):
            if counts[i] > 0:
                global_counts[i] += counts[i]
                global_blocks[i] += 1
    global_avg = [
        global_counts[i] / global_blocks[i] if global_blocks[i] > 0 else 0
        for i in range(168)
    ]

    # Step 5: Apply percentile mapping, with fallback for sparse blocks
    pressure = {}
    for block_id, counts in raw_counts.items():
        total_complaints = sum(1 for c in counts if c > 0)

        if total_complaints < 3:
            # Sparse block: use global average
            scores = [round(percentile_score(global_avg[i]), 3) for i in range(168)]
        else:
            scores = [round(percentile_score(v), 3) for v in counts]

        pressure[block_id] = scores

    return pressure


def main():
    args = parse_args()

    data_dir = Path(__file__).parent.parent / "public" / "data"
    meter_path = data_dir / "meter_locations.json"
    out_path = data_dir / "pressure_311.json"

    if not meter_path.exists():
        print(f"Error: {meter_path} not found. Run fetch_meter_locations.py first.",
              file=sys.stderr)
        sys.exit(1)

    block_centroids = load_block_centroids(meter_path)
    print(f"Loaded {len(block_centroids)} block centroids")

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=args.days)
    since_date = since.strftime("%Y-%m-%dT00:00:00")
    weeks = args.days / 7

    print(f"\nFetching 311 parking complaints ({args.days} days)...")
    start = time.time()
    complaints = fetch_complaints(since_date)
    print(f"  Total: {len(complaints)} complaints in {time.time() - start:.1f}s")

    print("\nSpatial join to block centroids...")
    start = time.time()
    block_complaints = spatial_join(complaints, block_centroids)
    print(f"  {len(block_complaints)} blocks with complaints ({time.time() - start:.1f}s)")

    print("\nComputing pressure scores...")
    pressure = compute_pressure_scores(block_complaints, weeks)

    # Validation
    if pressure:
        all_scores = [s for scores in pressure.values() for s in scores if s > 0]
        if all_scores:
            print(f"\nValidation:")
            print(f"  Blocks with pressure data: {len(pressure)}")
            print(f"  Non-zero scores: {len(all_scores)}")
            print(f"  Avg pressure (non-zero): {sum(all_scores)/len(all_scores):.3f}")
            print(f"  Max pressure: {max(all_scores):.3f}")

            # Check Saturday interpolation
            sat_scores = [
                pressure[bid][5 * 24 + h]
                for bid in pressure
                for h in range(24)
                if pressure[bid][5 * 24 + h] > 0
            ]
            if sat_scores:
                print(f"  Saturday non-zero scores: {len(sat_scores)} (interpolated)")

    with open(out_path, "w") as f:
        json.dump(pressure, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"\nWrote {out_path} ({size_kb:.0f} KB, {len(pressure)} blocks)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
