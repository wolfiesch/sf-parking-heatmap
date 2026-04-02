#!/usr/bin/env python3
"""
Aggregate parking meter transactions into a typical-week occupancy profile.
Uses bulk server-side GROUP BY (3 pages of 50K rows) instead of per-block queries.

Dataset: imvp-dq3v (Meter Operating Schedules and Transaction Counts)
Output: public/data/parking_week.json

SODA date_extract_dow() mapping:
  1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday, 6=Friday, 7=Saturday
We remap to ISO: 0=Monday, 1=Tuesday, ..., 6=Sunday

Usage: python3 scripts/aggregate_parking.py [--days 90]
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from argparse import ArgumentParser

# SODA dow (1=Sun..7=Sat) -> ISO dow (0=Mon..6=Sun)
SODA_DOW_TO_ISO = {1: 6, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5}

SODA_BASE = "https://data.sfgov.org/resource"
DATASET = "imvp-dq3v"
PAGE_SIZE = 50000

# Average session duration in hours (SFMTA avg ~1.2h for metered parking)
AVG_SESSION_HOURS = 1.2
# Compliance correction factor (accounts for unpaid parkers)
COMPLIANCE_FACTOR = 1.33


def parse_args():
    p = ArgumentParser(description="Aggregate parking occupancy by block/dow/hour")
    p.add_argument("--days", type=int, default=90, help="Lookback window in days")
    return p.parse_args()


def load_meter_locations(path):
    """Load block locations from fetch_meter_locations.py output."""
    with open(path) as f:
        blocks = json.load(f)
    return {b["id"]: b for b in blocks}


def load_enforcement_schedules(path):
    """Load enforcement schedule masks from fetch_enforcement_schedules.py output."""
    if not path.exists():
        print(f"  Warning: {path} not found, enforcement data will be omitted")
        return {}
    with open(path) as f:
        return json.load(f)


def load_pressure_data(path):
    """Load 311 pressure scores from fetch_311_pressure.py output."""
    if not path.exists():
        print(f"  Warning: {path} not found, pressure data will be omitted")
        return {}
    with open(path) as f:
        return json.load(f)


def load_parking_supply(path):
    """Load parking supply counts from fetch_parking_supply.py output."""
    if not path.exists():
        print(f"  Warning: {path} not found, supply data will be omitted")
        return {}
    with open(path) as f:
        return json.load(f)


def load_block_paths(path):
    """Load PCA-sorted block paths from compute_block_paths.py output."""
    if not path.exists():
        print(f"  Warning: {path} not found, block paths will be omitted")
        return {}
    with open(path) as f:
        return json.load(f)


def fetch_all_aggregated_sessions(since_date):
    """
    Fetch session counts grouped by street_block/dow/hour using paginated bulk queries.
    Returns list of dicts with keys: street_block, dow, hour, sessions.
    """
    all_rows = []
    offset = 0

    select = ",".join([
        "street_block",
        "date_extract_dow(session_start_dt) AS dow",
        "date_extract_hh(session_start_dt) AS hour",
        "count(*) AS sessions",
    ])

    while True:
        params = urllib.parse.urlencode({
            "$select": select,
            "$where": f"session_start_dt>'{since_date}'",
            "$group": "street_block,dow,hour",
            "$order": "street_block,dow,hour",
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


def compute_occupancy(sessions_count, meter_count, weeks):
    """Convert session count to occupancy ratio."""
    if meter_count <= 0 or weeks <= 0:
        return 0.0
    sessions_per_week = sessions_count / weeks
    raw = (sessions_per_week * AVG_SESSION_HOURS * COMPLIANCE_FACTOR) / meter_count
    return min(1.0, round(raw, 3))


def build_weekly_profiles(rows, meter_lookup, weeks):
    """
    Build 168-slot occupancy profiles for each block.
    Returns dict: block_id -> 168-element list of occupancy values.
    """
    # Accumulate raw session counts per block per slot
    block_sessions: dict[str, dict[int, int]] = {}

    for row in rows:
        block_id = row.get("street_block", "")
        soda_dow = int(row["dow"])
        hour = int(row["hour"])
        sessions = int(row["sessions"])

        iso_dow = SODA_DOW_TO_ISO.get(soda_dow)
        if iso_dow is None or not (0 <= hour <= 23):
            continue

        if block_id not in block_sessions:
            block_sessions[block_id] = {}

        idx = iso_dow * 24 + hour
        block_sessions[block_id][idx] = block_sessions[block_id].get(idx, 0) + sessions

    # Convert to occupancy
    profiles = {}
    matched = 0
    unmatched_blocks = set()

    for block_id, slot_sessions in block_sessions.items():
        meter_info = meter_lookup.get(block_id)
        if not meter_info:
            unmatched_blocks.add(block_id)
            continue

        matched += 1
        meter_count = meter_info["meters"]
        slots = [0.0] * 168

        for idx, count in slot_sessions.items():
            slots[idx] = compute_occupancy(count, meter_count, weeks)

        profiles[block_id] = slots

    print(f"  Matched {matched} blocks, {len(unmatched_blocks)} unmatched transaction blocks")
    return profiles


def validate_output(blocks):
    """Sanity-check the output data."""
    if not blocks:
        print("ERROR: No blocks produced!", file=sys.stderr)
        return False

    all_occ = [s for b in blocks for s in b["slots"] if s > 0]
    if not all_occ:
        print("WARNING: All occupancy values are zero", file=sys.stderr)
        return True

    avg_occ = sum(all_occ) / len(all_occ)
    max_occ = max(all_occ)
    nonzero_pct = len(all_occ) / (len(blocks) * 168) * 100

    print(f"\nValidation:")
    print(f"  Blocks with data: {len(blocks)}")
    print(f"  Non-zero slots: {len(all_occ)} ({nonzero_pct:.1f}%)")
    print(f"  Avg occupancy (non-zero): {avg_occ:.2f}")
    print(f"  Max occupancy: {max_occ:.2f}")

    # Spot-check: Wed 2pm (dow=2, hour=14, idx=62) vs Sun 6am (dow=6, hour=6, idx=150)
    wed_2pm = [b["slots"][2 * 24 + 14] for b in blocks if b["slots"][2 * 24 + 14] > 0]
    sun_6am = [b["slots"][6 * 24 + 6] for b in blocks if b["slots"][6 * 24 + 6] > 0]

    if wed_2pm:
        print(f"  Wed 2pm avg: {sum(wed_2pm)/len(wed_2pm):.2f} ({len(wed_2pm)} blocks)")
    if sun_6am:
        print(f"  Sun 6am avg: {sum(sun_6am)/len(sun_6am):.2f} ({len(sun_6am)} blocks)")

    return True


def main():
    args = parse_args()

    data_dir = Path(__file__).parent.parent / "public" / "data"
    meter_path = data_dir / "meter_locations.json"
    enforcement_path = data_dir / "enforcement_schedules.json"
    pressure_path = data_dir / "pressure_311.json"
    supply_path = data_dir / "parking_supply.json"
    paths_path = data_dir / "block_paths.json"
    out_path = data_dir / "parking_week.json"

    if not meter_path.exists():
        print(f"Error: {meter_path} not found. Run fetch_meter_locations.py first.", file=sys.stderr)
        sys.exit(1)

    meter_lookup = load_meter_locations(meter_path)
    print(f"Loaded {len(meter_lookup)} blocks from {meter_path}")

    enforcement = load_enforcement_schedules(enforcement_path)
    if enforcement:
        print(f"Loaded enforcement schedules for {len(enforcement)} blocks")

    pressure = load_pressure_data(pressure_path)
    if pressure:
        print(f"Loaded 311 pressure data for {len(pressure)} blocks")

    supply = load_parking_supply(supply_path)
    if supply:
        print(f"Loaded parking supply for {len(supply)} blocks")

    block_paths = load_block_paths(paths_path)
    if block_paths:
        print(f"Loaded block paths for {len(block_paths)} blocks")

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=args.days)
    since_date = since.strftime("%Y-%m-%dT00:00:00")
    weeks = args.days / 7

    print(f"Querying {args.days} days of data (since {since_date[:10]}, ~{weeks:.1f} weeks)")

    start = time.time()
    print("\nFetching aggregated sessions (bulk GROUP BY)...")
    rows = fetch_all_aggregated_sessions(since_date)
    print(f"  Total: {len(rows)} aggregated rows in {time.time() - start:.1f}s")

    print("\nBuilding weekly profiles...")
    profiles = build_weekly_profiles(rows, meter_lookup, weeks)

    # Build output: merge meter locations with occupancy profiles, enforcement, and pressure
    results = []
    pressure_blended = 0
    for block_id, meter_info in meter_lookup.items():
        meter_slots = profiles.get(block_id, [0.0] * 168)
        enforced_mask = enforcement.get(block_id)
        pressure_slots = pressure.get(block_id)

        # Blend: use meter data during enforced hours, pressure during non-enforced
        if enforced_mask and pressure_slots:
            final_slots = [0.0] * 168
            for i in range(168):
                if enforced_mask[i]:
                    final_slots[i] = meter_slots[i]
                else:
                    final_slots[i] = pressure_slots[i]
            pressure_blended += 1
        else:
            final_slots = meter_slots

        block = {
            "id": block_id,
            "lng": meter_info["lng"],
            "lat": meter_info["lat"],
            "meters": meter_info["meters"],
            "street": meter_info.get("street", ""),
            "hood": meter_info.get("hood", ""),
            "slots": final_slots,
        }

        if enforced_mask:
            block["enforced"] = enforced_mask

        block_supply = supply.get(block_id)
        if block_supply:
            block["supply"] = block_supply

        block_path_data = block_paths.get(block_id)
        if block_path_data:
            if isinstance(block_path_data, dict):
                block["path"] = block_path_data["path"]
                block["meterPositions"] = block_path_data["meters"]
            else:
                # Legacy format: list of coordinates
                block["path"] = block_path_data

        results.append(block)

    if pressure_blended:
        print(f"  Blended pressure data into {pressure_blended} blocks")

    results.sort(key=lambda x: x["id"])

    elapsed = time.time() - start
    print(f"Total time: {elapsed:.0f}s")

    if not validate_output(results):
        sys.exit(1)

    output = {
        "generated": now.isoformat(),
        "dateRange": {"from": since_date[:10], "to": now.strftime("%Y-%m-%d")},
        "blocks": results,
    }

    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"\nWrote {out_path} ({size_mb:.1f} MB, {len(results)} blocks)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
