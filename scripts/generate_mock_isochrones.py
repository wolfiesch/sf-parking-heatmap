#!/usr/bin/env python3
"""
Generate mock isochrone data for frontend development/testing.
Creates approximate circular polygons instead of real routing isochrones.

Generates contours at every 2 minutes from 2 to 20 (10 bands) for smooth
gradient visualization.

Usage: python3 scripts/generate_mock_isochrones.py
"""

import json
import math
from pathlib import Path

SF_BOUNDS = {
    "min_lat": 37.708,
    "max_lat": 37.812,
    "min_lng": -122.515,
    "max_lng": -122.357,
}

SF_LAND_POLYGON = [
    (-122.515, 37.708), (-122.390, 37.708), (-122.357, 37.730),
    (-122.357, 37.812), (-122.370, 37.812), (-122.420, 37.808),
    (-122.450, 37.808), (-122.480, 37.790), (-122.510, 37.780),
    (-122.515, 37.775), (-122.515, 37.708),
]

# 10 contour bands at 2-minute intervals for smooth gradient
CONTOUR_MINUTES = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
MODES = ["driving", "cycling", "walking"]

BASE_SPEEDS = {"driving": 30, "cycling": 18, "walking": 5}

PROFILE_FACTORS = {
    0: 0.69, 1: 0.83, 2: 0.65, 3: 1.00, 4: 0.87, 5: 1.00,
}


def point_in_polygon(lng, lat, polygon):
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


def generate_grid(spacing=0.009):
    points = []
    pid = 0
    lat = SF_BOUNDS["min_lat"]
    while lat <= SF_BOUNDS["max_lat"]:
        lng = SF_BOUNDS["min_lng"]
        while lng <= SF_BOUNDS["max_lng"]:
            if point_in_polygon(lng, lat, SF_LAND_POLYGON):
                points.append({"id": pid, "lat": round(lat, 5), "lng": round(lng, 5)})
                pid += 1
            lng += spacing
        lat += spacing
    return points


def make_organic_polygon(center_lat, center_lng, radius_km, num_points=36):
    """Generate an organic-looking polygon with natural variation."""
    coords = []
    # Use multiple sine frequencies for natural coastline-like edges
    seed = center_lat * 1000 + center_lng * 100
    for i in range(num_points + 1):
        angle = 2 * math.pi * i / num_points
        # Multi-frequency noise for organic shape
        noise = 1.0
        noise += 0.08 * math.sin(angle * 3 + seed)
        noise += 0.05 * math.sin(angle * 7 + seed * 1.3)
        noise += 0.03 * math.sin(angle * 13 + seed * 0.7)

        r = radius_km * noise
        dlat = (r / 111.32) * math.cos(angle)
        dlng = (r / (111.32 * math.cos(math.radians(center_lat)))) * math.sin(angle)
        coords.append([round(center_lng + dlng, 5), round(center_lat + dlat, 5)])

    coords[-1] = coords[0]
    return coords


def generate_isochrones_for_mode(grid, profile_map, mode):
    base_speed = BASE_SPEEDS[mode]
    isochrones = {}
    unique_profiles = list(range(6))

    for point in grid:
        pid = str(point["id"])
        isochrones[pid] = {}

        for profile_idx in unique_profiles:
            speed_factor = 1.0 if mode == "walking" else PROFILE_FACTORS[profile_idx]
            effective_speed = base_speed * speed_factor
            contour_features = {}

            for minutes in CONTOUR_MINUTES:
                radius_km = effective_speed * (minutes / 60.0)
                ring = make_organic_polygon(point["lat"], point["lng"], radius_km)
                contour_features[str(minutes)] = {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [ring]},
                    "properties": {"contour": minutes},
                }

            isochrones[pid][str(profile_idx)] = contour_features

    return isochrones


def main():
    data_dir = Path(__file__).parent.parent / "public" / "data"
    iso_dir = data_dir / "isochrones"
    iso_dir.mkdir(parents=True, exist_ok=True)

    profiles_path = data_dir / "speed_profiles.json"
    if not profiles_path.exists():
        print("Error: Run build_speed_profiles.py first")
        return

    with open(profiles_path) as f:
        speed_data = json.load(f)
    profile_map = speed_data["profileMap"]

    grid = generate_grid()
    print(f"Generated {len(grid)} grid points")

    for mode in MODES:
        print(f"Generating mock {mode} isochrones (10 bands per point)...")
        isochrones = generate_isochrones_for_mode(grid, profile_map, mode)
        output = {"grid": grid, "profileMap": profile_map, "isochrones": isochrones}
        out_path = iso_dir / f"{mode}.json"
        with open(out_path, "w") as f:
            json.dump(output, f, separators=(",", ":"))
        size_kb = out_path.stat().st_size / 1024
        print(f"  Wrote {out_path} ({size_kb:.0f} KB)")

    print(f"\nDone! 10-band mock isochrones in {iso_dir}/")


if __name__ == "__main__":
    main()
