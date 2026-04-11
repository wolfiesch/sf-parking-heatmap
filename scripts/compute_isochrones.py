#!/usr/bin/env python3
"""
Compute isochrones on a grid of ~120 points across San Francisco.
Calls a local Valhalla instance (Docker) for each grid point x mode x speed profile.

Prerequisites:
  docker compose up -d   # starts Valhalla on port 8002
  python3 scripts/build_speed_profiles.py  # generates speed_profiles.json

Output: public/data/isochrones/{driving,cycling,walking}.json

Each file contains:
  {
    "grid": [{"id": 0, "lat": 37.71, "lng": -122.50}, ...],
    "profileMap": [3, 0, 0, ...],  // 168 entries
    "isochrones": {
      "0": {        // grid point ID
        "0": {      // profile index
          "5":  <GeoJSON Feature>,
          "10": <GeoJSON Feature>,
          "15": <GeoJSON Feature>,
          "20": <GeoJSON Feature>
        }
      }
    }
  }

Usage:
  python3 scripts/compute_isochrones.py [--valhalla-url http://localhost:8002]
                                        [--spacing 0.009]
                                        [--tolerance 0.0002]
                                        [--modes driving,cycling,walking]
"""

import json
import math
import sys
import time
import urllib.request
import urllib.error
from argparse import ArgumentParser
from pathlib import Path

# SF bounding box (land area, excluding ocean/bay)
SF_BOUNDS = {
    "min_lat": 37.708,
    "max_lat": 37.812,
    "min_lng": -122.515,
    "max_lng": -122.357,
}

# Rough SF land polygon (simplified) to exclude ocean/bay grid points
# Points roughly trace the SF coastline
SF_LAND_POLYGON = [
    (-122.515, 37.708), (-122.390, 37.708), (-122.357, 37.730),
    (-122.357, 37.812), (-122.370, 37.812), (-122.420, 37.808),
    (-122.450, 37.808), (-122.480, 37.790), (-122.510, 37.780),
    (-122.515, 37.775), (-122.515, 37.708),
]

CONTOUR_MINUTES = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]

VALHALLA_COSTING = {
    "driving": "auto",
    "cycling": "bicycle",
    "walking": "pedestrian",
}

# Speed scaling per profile for Valhalla costing options
# These adjust the effective speed_multiplier in Valhalla requests
PROFILE_SPEED_FACTORS = {
    0: 0.69,   # weekday_am_peak: 1/1.45
    1: 0.83,   # weekday_midday: 1/1.20
    2: 0.65,   # weekday_pm_peak: 1/1.55
    3: 1.00,   # weekday_night: free flow
    4: 0.87,   # weekend_day: 1/1.15
    5: 1.00,   # weekend_night: free flow
}


def point_in_polygon(lng: float, lat: float, polygon: list) -> bool:
    """Ray-casting point-in-polygon test."""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def generate_grid(spacing: float) -> list:
    """Generate grid points at `spacing` degree intervals, clipped to SF land."""
    points = []
    pid = 0
    lat = SF_BOUNDS["min_lat"]
    while lat <= SF_BOUNDS["max_lat"]:
        lng = SF_BOUNDS["min_lng"]
        while lng <= SF_BOUNDS["max_lng"]:
            if point_in_polygon(lng, lat, SF_LAND_POLYGON):
                points.append({
                    "id": pid,
                    "lat": round(lat, 5),
                    "lng": round(lng, 5),
                })
                pid += 1
            lng += spacing
        lat += spacing
    return points


def douglas_peucker(coords: list, tolerance: float) -> list:
    """Simplify a coordinate list using Douglas-Peucker algorithm."""
    if len(coords) <= 2:
        return coords

    # Find the point with maximum distance from the line between first and last
    max_dist = 0
    max_idx = 0
    start = coords[0]
    end = coords[-1]

    for i in range(1, len(coords) - 1):
        dist = perpendicular_distance(coords[i], start, end)
        if dist > max_dist:
            max_dist = dist
            max_idx = i

    if max_dist > tolerance:
        left = douglas_peucker(coords[:max_idx + 1], tolerance)
        right = douglas_peucker(coords[max_idx:], tolerance)
        return left[:-1] + right
    else:
        return [start, end]


def perpendicular_distance(point, line_start, line_end):
    """Calculate perpendicular distance from point to line segment."""
    dx = line_end[0] - line_start[0]
    dy = line_end[1] - line_start[1]
    if dx == 0 and dy == 0:
        return math.sqrt((point[0] - line_start[0])**2 + (point[1] - line_start[1])**2)
    t = ((point[0] - line_start[0]) * dx + (point[1] - line_start[1]) * dy) / (dx * dx + dy * dy)
    t = max(0, min(1, t))
    proj_x = line_start[0] + t * dx
    proj_y = line_start[1] + t * dy
    return math.sqrt((point[0] - proj_x)**2 + (point[1] - proj_y)**2)


def quantize_coords(coords: list, decimals: int = 5) -> list:
    """Round coordinates to `decimals` decimal places."""
    return [[round(c[0], decimals), round(c[1], decimals)] for c in coords]


def simplify_feature(feature: dict, tolerance: float) -> dict:
    """Simplify and quantize a GeoJSON Feature's geometry."""
    geom = feature.get("geometry", {})
    geom_type = geom.get("type")

    if geom_type == "Polygon":
        new_rings = []
        for ring in geom["coordinates"]:
            simplified = douglas_peucker(ring, tolerance)
            new_rings.append(quantize_coords(simplified))
        geom["coordinates"] = new_rings
    elif geom_type == "MultiPolygon":
        new_polys = []
        for polygon in geom["coordinates"]:
            new_rings = []
            for ring in polygon:
                simplified = douglas_peucker(ring, tolerance)
                new_rings.append(quantize_coords(simplified))
            new_polys.append(new_rings)
        geom["coordinates"] = new_polys

    # Strip unnecessary properties, keep only contour minutes
    props = feature.get("properties", {})
    feature = {
        "type": "Feature",
        "geometry": geom,
        "properties": {"contour": props.get("contour", 0)},
    }
    return feature


def call_valhalla(url: str, lat: float, lng: float, costing: str,
                  contours: list, speed_factor: float) -> list:
    """Call Valhalla /isochrone endpoint and return GeoJSON features."""
    body = {
        "locations": [{"lat": lat, "lon": lng}],
        "costing": costing,
        "contours": [{"time": m} for m in contours],
        "polygons": True,
        "denoise": 0.5,
        "generalize": 50,
    }

    # Apply speed factor for traffic simulation (driving only)
    if costing == "auto" and speed_factor < 1.0:
        body["costing_options"] = {
            "auto": {
                "top_speed": int(120 * speed_factor),  # km/h
            }
        }
    elif costing == "bicycle" and speed_factor < 1.0:
        body["costing_options"] = {
            "bicycle": {
                "cycling_speed": max(10, int(25 * speed_factor)),
            }
        }

    payload = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{url}/isochrone",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())

    return data.get("features", [])


def compute_mode(grid: list, profile_map: list, mode: str,
                 valhalla_url: str, tolerance: float) -> dict:
    """Compute isochrones for all grid points x profiles for a single mode."""
    costing = VALHALLA_COSTING[mode]
    unique_profiles = sorted(set(profile_map))

    # Walking/cycling: skip traffic profiles - use single profile
    if mode == "walking":
        unique_profiles = [3]  # free flow only
    elif mode == "cycling":
        # Cycling affected by traffic but less so - use subset
        unique_profiles = sorted(set(profile_map))

    isochrones = {}
    total = len(grid) * len(unique_profiles)
    done = 0
    errors = 0
    start = time.time()

    for point in grid:
        pid = str(point["id"])
        isochrones[pid] = {}

        for profile_idx in unique_profiles:
            speed_factor = PROFILE_SPEED_FACTORS[profile_idx]

            # Walking is unaffected by traffic
            if mode == "walking":
                speed_factor = 1.0

            try:
                features = call_valhalla(
                    valhalla_url, point["lat"], point["lng"],
                    costing, CONTOUR_MINUTES, speed_factor,
                )

                contour_features = {}
                for feat in features:
                    minutes = feat.get("properties", {}).get("contour", 0)
                    simplified = simplify_feature(feat, tolerance)
                    contour_features[str(minutes)] = simplified

                isochrones[pid][str(profile_idx)] = contour_features

            except (urllib.error.URLError, urllib.error.HTTPError, Exception) as e:
                errors += 1
                if errors <= 5:
                    print(f"  Error at grid {pid} profile {profile_idx}: {e}")

            done += 1
            if done % 20 == 0 or done == total:
                elapsed = time.time() - start
                rate = done / elapsed if elapsed > 0 else 0
                eta = (total - done) / rate if rate > 0 else 0
                print(f"  {mode}: {done}/{total} ({rate:.1f}/s, ETA {eta:.0f}s)")

    # For walking, copy the single profile to all profile indices
    if mode == "walking":
        for pid in isochrones:
            base = isochrones[pid].get("3", {})
            for p in range(6):
                isochrones[pid][str(p)] = base

    return isochrones


def check_valhalla(url: str) -> bool:
    """Check if Valhalla is running and has routing tiles."""
    try:
        body = json.dumps({
            "locations": [
                {"lat": 37.7749, "lon": -122.4194},
                {"lat": 37.7849, "lon": -122.4094},
            ],
            "costing": "auto",
        }).encode()
        req = urllib.request.Request(
            f"{url}/route",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return "trip" in data
    except Exception as e:
        print(f"Valhalla check failed: {e}")
        return False


def parse_args():
    p = ArgumentParser(description="Compute isochrones for SF grid")
    p.add_argument("--valhalla-url", default="http://localhost:8002",
                    help="Valhalla server URL")
    p.add_argument("--spacing", type=float, default=0.009,
                    help="Grid spacing in degrees (~1km)")
    p.add_argument("--tolerance", type=float, default=0.0002,
                    help="Douglas-Peucker simplification tolerance (~20m)")
    p.add_argument("--modes", default="driving,cycling,walking",
                    help="Comma-separated transport modes")
    return p.parse_args()


def main():
    args = parse_args()
    modes = [m.strip() for m in args.modes.split(",")]

    data_dir = Path(__file__).parent.parent / "public" / "data"
    iso_dir = data_dir / "isochrones"
    iso_dir.mkdir(parents=True, exist_ok=True)

    # Load speed profiles
    profiles_path = data_dir / "speed_profiles.json"
    if not profiles_path.exists():
        print("Error: Run build_speed_profiles.py first", file=sys.stderr)
        sys.exit(1)

    with open(profiles_path) as f:
        speed_data = json.load(f)
    profile_map = speed_data["profileMap"]
    print(f"Loaded {len(profile_map)} speed profile mappings")

    # Check Valhalla
    print(f"\nChecking Valhalla at {args.valhalla_url}...")
    if not check_valhalla(args.valhalla_url):
        print("Error: Valhalla is not responding. Run: docker compose up -d")
        print("First run builds routing tiles (~15 min). Check: docker compose logs -f")
        sys.exit(1)
    print("Valhalla is ready")

    # Generate grid
    grid = generate_grid(args.spacing)
    print(f"\nGenerated {len(grid)} grid points (spacing={args.spacing} deg)")

    # Compute isochrones per mode
    for mode in modes:
        if mode not in VALHALLA_COSTING:
            print(f"Skipping unknown mode: {mode}")
            continue

        print(f"\n{'='*60}")
        print(f"Computing {mode} isochrones...")
        print(f"{'='*60}")

        start = time.time()
        isochrones = compute_mode(
            grid, profile_map, mode,
            args.valhalla_url, args.tolerance,
        )
        elapsed = time.time() - start

        output = {
            "grid": grid,
            "profileMap": profile_map,
            "isochrones": isochrones,
        }

        out_path = iso_dir / f"{mode}.json"
        with open(out_path, "w") as f:
            json.dump(output, f, separators=(",", ":"))

        size_kb = out_path.stat().st_size / 1024
        print(f"\n  Wrote {out_path} ({size_kb:.0f} KB) in {elapsed:.0f}s")

    print(f"\nDone! Isochrone files in {iso_dir}/")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted")
        sys.exit(1)
