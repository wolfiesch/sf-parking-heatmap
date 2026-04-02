#!/usr/bin/env python3
"""
Fetch meter enforcement (operating) schedules from SF Open Data.

Dataset: 6cqg-dxku (Parking Meter Operating Schedules)
Output: public/data/enforcement_schedules.json

For each block, produces a 168-element array (7 days x 24 hours) of 0/1
indicating whether meters are enforced during that slot.
A slot is enforced if ANY meter on the block is active during that hour.

Default (if no schedule found): Mon-Sat 9am-6pm.

Usage: python3 scripts/fetch_enforcement_schedules.py
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

SODA_BASE = "https://data.sfgov.org/resource"
DATASET = "6cqg-dxku"
PAGE_SIZE = 50000

# Map SODA day codes to ISO dow (0=Mon..6=Sun)
DAY_CODE_TO_ISO = {
    "Mo": 0, "Tu": 1, "We": 2, "Th": 3, "Fr": 4, "Sa": 5, "Su": 6,
}

# Default schedule: Mon-Sat 9am-6pm (covers ~80% of SF meters)
DEFAULT_SCHEDULE = [0] * 168
for _dow in range(6):  # Mon-Sat
    for _hour in range(9, 18):
        DEFAULT_SCHEDULE[_dow * 24 + _hour] = 1


def parse_time(t):
    """Parse '9:00 AM' / '6:00 PM' / '12:00 PM' to 24-hour int."""
    t = t.strip().upper()
    parts = t.replace(":", " ").split()
    if len(parts) < 3:
        return None
    hour = int(parts[0])
    ampm = parts[2]
    if ampm == "AM":
        if hour == 12:
            hour = 0
    else:  # PM
        if hour != 12:
            hour += 12
    return hour


def parse_days(days_str):
    """Parse 'Mo,Tu,We,Th,Fr' to set of ISO dow ints."""
    result = set()
    for code in days_str.split(","):
        code = code.strip()
        if code in DAY_CODE_TO_ISO:
            result.add(DAY_CODE_TO_ISO[code])
    return result


def fetch_schedules():
    """Fetch all operating schedule records, paginated."""
    all_rows = []
    offset = 0

    while True:
        params = urllib.parse.urlencode({
            "$select": "street_and_block,days_applied,from_time,to_time",
            "$where": "schedule_type='Operating Schedule'",
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


def build_enforcement_masks(rows):
    """
    Build per-block 168-element enforcement arrays.
    Union all schedule windows across all meters on a block.
    """
    block_masks = {}

    parsed = 0
    skipped = 0
    for row in rows:
        block_id = row.get("street_and_block", "").strip()
        days_str = row.get("days_applied", "")
        from_str = row.get("from_time", "")
        to_str = row.get("to_time", "")

        if not block_id or not days_str or not from_str or not to_str:
            skipped += 1
            continue

        days = parse_days(days_str)
        from_hour = parse_time(from_str)
        to_hour = parse_time(to_str)

        if from_hour is None or to_hour is None or not days:
            skipped += 1
            continue

        parsed += 1

        if block_id not in block_masks:
            block_masks[block_id] = [0] * 168

        mask = block_masks[block_id]
        for dow in days:
            for hour in range(from_hour, to_hour):
                if 0 <= hour < 24:
                    mask[dow * 24 + hour] = 1

    print(f"  Parsed {parsed} schedule records, skipped {skipped}")
    print(f"  Found schedules for {len(block_masks)} blocks")
    return block_masks


def main():
    data_dir = Path(__file__).parent.parent / "public" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    out_path = data_dir / "enforcement_schedules.json"
    meter_path = data_dir / "meter_locations.json"

    # Load known block IDs to apply defaults
    known_blocks = set()
    if meter_path.exists():
        with open(meter_path) as f:
            for block in json.load(f):
                known_blocks.add(block["id"])
        print(f"Loaded {len(known_blocks)} known blocks from meter_locations.json")

    print("\nFetching enforcement schedules...")
    start = time.time()
    rows = fetch_schedules()
    print(f"  Total: {len(rows)} rows in {time.time() - start:.1f}s")

    print("\nBuilding enforcement masks...")
    block_masks = build_enforcement_masks(rows)

    # Apply defaults for known blocks without schedule data
    defaults_applied = 0
    for block_id in known_blocks:
        if block_id not in block_masks:
            block_masks[block_id] = list(DEFAULT_SCHEDULE)
            defaults_applied += 1

    print(f"  Applied default schedule to {defaults_applied} blocks without data")

    # Validation
    total_enforced = sum(sum(m) for m in block_masks.values())
    total_slots = len(block_masks) * 168
    pct = total_enforced / total_slots * 100 if total_slots > 0 else 0
    print(f"\nValidation:")
    print(f"  Blocks with schedules: {len(block_masks)}")
    print(f"  Enforced slots: {total_enforced}/{total_slots} ({pct:.1f}%)")

    # Spot check: typical weekday should be ~37-54% enforced (9am-6pm = 9/24)
    wed_enforced = sum(1 for m in block_masks.values() if m[2 * 24 + 14] == 1)
    sun_3am_enforced = sum(1 for m in block_masks.values() if m[6 * 24 + 3] == 1)
    print(f"  Wed 2pm enforced: {wed_enforced}/{len(block_masks)} blocks")
    print(f"  Sun 3am enforced: {sun_3am_enforced}/{len(block_masks)} blocks")

    with open(out_path, "w") as f:
        json.dump(block_masks, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"\nWrote {out_path} ({size_kb:.0f} KB, {len(block_masks)} blocks)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
