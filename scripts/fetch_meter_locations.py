#!/usr/bin/env python3
"""
Fetch active meter locations from SF Open Data (SODA API).
Groups meters by street_block to compute block centroids and meter counts.
Output: public/data/meter_locations.json

Dataset: 8vzz-qzz9 (Parking Meters)
  - active_meter_flag: M=active, U=unknown, T=temp, P=planned, L=legacy
  - street_block derived from: street_name + hundreds(street_num) to match
    the imvp-dq3v transaction dataset's street_block format (e.g. "BAY ST 400")

Usage: python3 scripts/fetch_meter_locations.py
"""

import json
import math
import sys
import urllib.request
import urllib.parse
from collections import defaultdict
from pathlib import Path

SODA_BASE = "https://data.sfgov.org/resource"
DATASET = "8vzz-qzz9"
LIMIT = 50000

# SF bounding box for validation
SF_BBOX = {"lat_min": 37.70, "lat_max": 37.82, "lng_min": -122.52, "lng_max": -122.35}


def fetch_meters():
    """Fetch all active meters from SODA API."""
    params = urllib.parse.urlencode({
        "$limit": LIMIT,
        "$where": "active_meter_flag='M'",
        "$select": "post_id,street_name,street_num,latitude,longitude,analysis_neighborhood",
    })
    url = f"{SODA_BASE}/{DATASET}.json?{params}"

    print(f"Fetching meters from SODA API...")
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())

    print(f"  Received {len(data)} active meter records")
    return data


def derive_street_block(street_name, street_num):
    """
    Derive street_block from street_name + street_num to match
    the transactions dataset format: "STREET_NAME HUNDREDS"
    e.g., street_name="BAY ST", street_num="431" -> "BAY ST 400"
    """
    try:
        num = int(street_num)
        hundreds = int(math.floor(num / 100) * 100)
        return f"{street_name} {hundreds}"
    except (ValueError, TypeError):
        return None


def group_by_block(meters):
    """Group meters by derived street_block, compute centroids and counts."""
    blocks: dict[str, dict] = defaultdict(
        lambda: {"lats": [], "lngs": [], "count": 0, "street": "", "hood": ""}
    )

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

        # Validate within SF bbox
        if not (SF_BBOX["lat_min"] <= lat <= SF_BBOX["lat_max"] and
                SF_BBOX["lng_min"] <= lng <= SF_BBOX["lng_max"]):
            skipped += 1
            continue

        b = blocks[block_id]
        b["lats"].append(lat)
        b["lngs"].append(lng)
        b["count"] += 1
        b["street"] = street_name
        if m.get("analysis_neighborhood"):
            b["hood"] = m["analysis_neighborhood"]

    if skipped:
        print(f"  Skipped {skipped} meters (missing data or out of SF bbox)")

    # Compute centroids
    result = []
    for block_id, b in blocks.items():
        lat_avg = sum(b["lats"]) / len(b["lats"])
        lng_avg = sum(b["lngs"]) / len(b["lngs"])

        result.append({
            "id": block_id,
            "lat": round(lat_avg, 6),
            "lng": round(lng_avg, 6),
            "meters": b["count"],
            "street": b["street"],
            "hood": b["hood"],
        })

    result.sort(key=lambda x: x["id"])
    return result


def main():
    out_dir = Path(__file__).parent.parent / "public" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "meter_locations.json"

    meters = fetch_meters()
    blocks = group_by_block(meters)

    print(f"\nProcessed {len(blocks)} unique blocks")
    print(f"  Meter range: {min(b['meters'] for b in blocks)}-{max(b['meters'] for b in blocks)} per block")
    print(f"  Lat range: {min(b['lat'] for b in blocks):.4f} - {max(b['lat'] for b in blocks):.4f}")
    print(f"  Lng range: {min(b['lng'] for b in blocks):.4f} - {max(b['lng'] for b in blocks):.4f}")

    # Sample neighborhoods
    hoods = set(b["hood"] for b in blocks if b["hood"])
    print(f"  Neighborhoods: {len(hoods)} ({', '.join(sorted(hoods)[:5])}...)")

    with open(out_path, "w") as f:
        json.dump(blocks, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"\nWrote {out_path} ({size_kb:.0f} KB, {len(blocks)} blocks)")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
