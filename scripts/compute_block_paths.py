#!/usr/bin/env python3
"""
Compute PCA-sorted meter paths per block from individual meter positions.

For each block with 2+ meters, sorts meter positions along the street's
principal axis (PCA) to produce an ordered path that traces the block extent.
Single-meter blocks get null (rendered as fallback circles in the frontend).

Dataset: 8vzz-qzz9 (Parking Meters) - same as fetch_meter_locations.py
Output: public/data/block_paths.json

Usage: python3 scripts/compute_block_paths.py
"""

import json
import math
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

SODA_BASE = "https://data.sfgov.org/resource"
DATASET = "8vzz-qzz9"
LIMIT = 50000

# SF bounding box for validation
SF_BBOX = {"lat_min": 37.70, "lat_max": 37.82, "lng_min": -122.52, "lng_max": -122.35}


def fetch_meters():
    """Fetch all active meters with individual positions."""
    params = urllib.parse.urlencode({
        "$limit": LIMIT,
        "$where": "active_meter_flag='M'",
        "$select": "post_id,street_name,street_num,latitude,longitude",
    })
    url = f"{SODA_BASE}/{DATASET}.json?{params}"

    print("Fetching meters from SODA API...")
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode())

    print(f"  Received {len(data)} active meter records")
    return data


def derive_street_block(street_name, street_num):
    """Derive street_block ID matching the transactions dataset format."""
    try:
        num = int(street_num)
        hundreds = int(math.floor(num / 100) * 100)
        return f"{street_name} {hundreds}"
    except (ValueError, TypeError):
        return None


def group_meters_by_block(meters):
    """Group meter [lng, lat] positions by block ID."""
    blocks = defaultdict(list)
    skipped = 0

    for m in meters:
        street_name = m.get("street_name")
        street_num = m.get("street_num")
        lat = m.get("latitude")
        lng = m.get("longitude")

        if not street_name or not street_num or not lat or not lng:
            skipped += 1
            continue

        block_id = derive_street_block(street_name, street_num)
        if not block_id:
            skipped += 1
            continue

        lat, lng = float(lat), float(lng)

        if not (SF_BBOX["lat_min"] <= lat <= SF_BBOX["lat_max"] and
                SF_BBOX["lng_min"] <= lng <= SF_BBOX["lng_max"]):
            skipped += 1
            continue

        blocks[block_id].append([lng, lat])

    if skipped:
        print(f"  Skipped {skipped} meters (missing data or out of SF bbox)")

    return blocks


def compute_pca_angle(positions):
    """Compute the PCA principal axis angle for a set of 2D points."""
    n = len(positions)
    mean_x = sum(p[0] for p in positions) / n
    mean_y = sum(p[1] for p in positions) / n

    cxx = sum((p[0] - mean_x) ** 2 for p in positions) / n
    cyy = sum((p[1] - mean_y) ** 2 for p in positions) / n
    cxy = sum((p[0] - mean_x) * (p[1] - mean_y) for p in positions) / n

    theta = 0.5 * math.atan2(2 * cxy, cxx - cyy)
    return theta, mean_x, mean_y


def find_grid_angle(all_angles):
    """
    Find the dominant street grid angle from all PCA angles.

    SF's street grid is rotated ~9° from cardinal directions. We find the
    exact angle by computing the circular mean of all block angles mod 90°
    (since perpendicular streets are 90° apart, we only need one base angle).

    Uses the "multiply by 4" trick to map [0, π/2) to a full circle for
    circular statistics, then divides back.
    """
    reduced = [a % (math.pi / 2) for a in all_angles]
    # Map [0, π/2) -> [0, 2π) by multiplying by 4
    quadrupled = [a * 4 for a in reduced]
    mean_sin = sum(math.sin(a) for a in quadrupled) / len(quadrupled)
    mean_cos = sum(math.cos(a) for a in quadrupled) / len(quadrupled)
    grid_angle = math.atan2(mean_sin, mean_cos) / 4
    if grid_angle < 0:
        grid_angle += math.pi / 2
    return grid_angle


def snap_angle_to_grid(theta, grid_angle, max_deviation_deg=15):
    """
    Snap a PCA angle to the nearest grid line, but only if it's close enough.

    Streets on the main grid (most of SF) get snapped for pixel-perfect
    alignment. Diagonal streets (Market, Columbus, Divisadero) keep their
    PCA-derived angle since they don't belong to the regular grid.
    """
    max_dev = math.radians(max_deviation_deg)
    best_angle = theta
    best_diff = float("inf")
    for k in range(4):
        candidate = grid_angle + k * math.pi / 2
        diff = (theta - candidate + math.pi) % (2 * math.pi) - math.pi
        if abs(diff) < best_diff:
            best_diff = abs(diff)
            best_angle = candidate

    # Only snap if the PCA angle is close to a grid line
    if best_diff <= max_dev:
        return best_angle
    return theta


def compute_block_path(positions, grid_angle):
    """
    Compute a 2-point path (endpoints) for a block, snapped to the grid.

    1. Compute PCA to find the rough street direction
    2. Snap to the nearest grid line (eliminates GPS angle jitter)
    3. Project all points onto the snapped axis
    4. Return the two extreme endpoints AND the original meter positions
    """
    theta, mean_x, mean_y = compute_pca_angle(positions)
    snapped_theta = snap_angle_to_grid(theta, grid_angle)

    cos_t = math.cos(snapped_theta)
    sin_t = math.sin(snapped_theta)

    # Project all points onto the grid-snapped axis
    projections = []
    for p in positions:
        dx = p[0] - mean_x
        dy = p[1] - mean_y
        t = dx * cos_t + dy * sin_t
        projections.append(t)

    t_min = min(projections)
    t_max = max(projections)

    # Reconstruct the two endpoints on the grid-snapped center line
    start = [mean_x + t_min * cos_t, mean_y + t_min * sin_t]
    end = [mean_x + t_max * cos_t, mean_y + t_max * sin_t]

    return [start, end], positions, snapped_theta


def compute_block_paths(blocks):
    """
    Compute grid-aligned 2-point paths for all blocks.

    Two-pass approach:
    1. First pass: compute PCA angles for all blocks to find the dominant grid
    2. Second pass: snap each block's angle to the grid and compute endpoints
    """
    # Deduplicate and filter blocks
    prepared = {}
    single_meter = 0

    for block_id, positions in blocks.items():
        if len(positions) < 2:
            single_meter += 1
            continue

        seen = set()
        unique = []
        for p in positions:
            key = (round(p[0], 7), round(p[1], 7))
            if key not in seen:
                seen.add(key)
                unique.append(p)

        if len(unique) < 2:
            single_meter += 1
            continue

        prepared[block_id] = unique

    # First pass: compute PCA angles to find grid
    all_angles = []
    for positions in prepared.values():
        theta, _, _ = compute_pca_angle(positions)
        all_angles.append(theta)

    grid_angle = find_grid_angle(all_angles)
    print(f"  Detected grid angle: {math.degrees(grid_angle):.1f}° (from {len(all_angles)} blocks)")

    # Second pass: snap to grid and compute endpoints
    paths = {}
    for block_id in blocks:
        if block_id not in prepared:
            paths[block_id] = None
            continue

        path, meter_positions, _ = compute_block_path(prepared[block_id], grid_angle)
        paths[block_id] = {
            "path": [[round(p[0], 6), round(p[1], 6)] for p in path],
            "meters": [[round(p[0], 6), round(p[1], 6)] for p in meter_positions],
        }

    multi_meter = len(prepared)
    print(f"  {multi_meter} blocks with paths, {single_meter} single-meter blocks (null)")
    return paths


def main():
    out_dir = Path(__file__).parent.parent / "public" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "block_paths.json"

    meters = fetch_meters()
    blocks = group_meters_by_block(meters)
    print(f"  Grouped into {len(blocks)} blocks")

    print("\nComputing PCA-sorted paths...")
    paths = compute_block_paths(blocks)

    with open(out_path, "w") as f:
        json.dump(paths, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"\nWrote {out_path} ({size_kb:.0f} KB, {len(paths)} blocks)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
