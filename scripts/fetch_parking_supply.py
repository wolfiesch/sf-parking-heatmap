#!/usr/bin/env python3
"""
Fetch parking supply data from SF Open Data.

Dataset: 9ivs-nf5y (Parking Supply - Street Segment Data)
Output: public/data/parking_supply.json

Fetches street segments with parking supply counts and LineString geometry,
computes segment centroids, and spatial-joins to block centroids from
meter_locations.json. Sums supply per block.

Note: Data is from 2010-2011 but parking supply is relatively stable.

Usage: python3 scripts/fetch_parking_supply.py
"""

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

SODA_BASE = "https://data.sfgov.org/resource"
DATASET = "9ivs-nf5y"
PAGE_SIZE = 50000

# 150m radius for spatial join (slightly larger than enforcement/311)
MAX_DIST_LAT = 0.00135
MAX_DIST_LNG = 0.0018


def load_block_centroids(path):
    """Load block centroids from meter_locations.json."""
    with open(path) as f:
        blocks = json.load(f)
    return [(b["id"], b["lat"], b["lng"]) for b in blocks]


def fetch_segments():
    """Fetch all parking supply segments."""
    all_rows = []
    offset = 0

    while True:
        params = urllib.parse.urlencode({
            "$select": "prkg_sply,shape",
            "$where": "prkg_sply>0",
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


def segment_centroid(geom):
    """Compute centroid from a LineString or MultiLineString geometry."""
    coords = []

    if not geom or "coordinates" not in geom:
        return None

    geom_type = geom.get("type", "")

    if geom_type == "LineString":
        coords = geom["coordinates"]
    elif geom_type == "MultiLineString":
        for line in geom["coordinates"]:
            coords.extend(line)
    elif geom_type == "Point":
        return geom["coordinates"][1], geom["coordinates"][0]
    else:
        return None

    if not coords:
        return None

    lngs = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return sum(lats) / len(lats), sum(lngs) / len(lngs)


def spatial_join_supply(segments, block_centroids):
    """
    Match each supply segment to nearest block centroid within 150m.
    Sum supply per block.
    """
    block_supply = {}
    matched = 0
    skipped = 0

    for seg in segments:
        supply = int(seg.get("prkg_sply", 0))
        if supply <= 0:
            skipped += 1
            continue

        geom = seg.get("shape")
        centroid = segment_centroid(geom)
        if centroid is None:
            skipped += 1
            continue

        slat, slng = centroid

        best_block = None
        best_dist = float("inf")

        for block_id, blat, blng in block_centroids:
            dlat = abs(slat - blat)
            if dlat > MAX_DIST_LAT:
                continue
            dlng = abs(slng - blng)
            if dlng > MAX_DIST_LNG:
                continue

            dist = math.sqrt(dlat * dlat + dlng * dlng)
            if dist < best_dist:
                best_dist = dist
                best_block = block_id

        if best_block:
            matched += 1
            block_supply[best_block] = block_supply.get(best_block, 0) + supply
        else:
            skipped += 1

    print(f"  Matched {matched} segments to blocks, {skipped} skipped")
    return block_supply


def main():
    data_dir = Path(__file__).parent.parent / "public" / "data"
    meter_path = data_dir / "meter_locations.json"
    out_path = data_dir / "parking_supply.json"

    if not meter_path.exists():
        print(f"Error: {meter_path} not found. Run fetch_meter_locations.py first.",
              file=sys.stderr)
        sys.exit(1)

    block_centroids = load_block_centroids(meter_path)
    print(f"Loaded {len(block_centroids)} block centroids")

    print("\nFetching parking supply segments...")
    start = time.time()
    segments = fetch_segments()
    print(f"  Total: {len(segments)} segments in {time.time() - start:.1f}s")

    print("\nSpatial join to block centroids...")
    start = time.time()
    block_supply = spatial_join_supply(segments, block_centroids)
    print(f"  {len(block_supply)} blocks with supply data ({time.time() - start:.1f}s)")

    # Validation
    if block_supply:
        supplies = list(block_supply.values())
        print(f"\nValidation:")
        print(f"  Blocks with supply: {len(supplies)}")
        print(f"  Total spaces: {sum(supplies)}")
        print(f"  Avg spaces/block: {sum(supplies)/len(supplies):.1f}")
        print(f"  Range: {min(supplies)} - {max(supplies)}")

    with open(out_path, "w") as f:
        json.dump(block_supply, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"\nWrote {out_path} ({size_kb:.0f} KB, {len(block_supply)} blocks)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
