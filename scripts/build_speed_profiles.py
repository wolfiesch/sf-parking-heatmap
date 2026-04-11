#!/usr/bin/env python3
"""
Classify 168 time slots (7 days x 24 hours) into 6 speed profiles
that approximate SF traffic congestion patterns.

Speed profiles:
  0: weekday_am_peak    (Mon-Fri 7-9 AM)
  1: weekday_midday     (Mon-Fri 10 AM-3 PM)
  2: weekday_pm_peak    (Mon-Fri 4-7 PM)
  3: weekday_night      (Mon-Fri 8 PM-6 AM)
  4: weekend_day        (Sat-Sun 8 AM-8 PM)
  5: weekend_night      (Sat-Sun 8 PM-8 AM)

Congestion multipliers are derived from SFCTA CMP corridor data
and Caltrans PeMS freeway sensor averages for San Francisco.
Higher multiplier = more congestion = slower travel = smaller isochrones.

Output: public/data/speed_profiles.json
"""

import json
from pathlib import Path

PROFILE_NAMES = [
    "weekday_am_peak",
    "weekday_midday",
    "weekday_pm_peak",
    "weekday_night",
    "weekend_day",
    "weekend_night",
]

# Congestion multipliers relative to free-flow speed.
# 1.0 = free flow, higher = slower.
# Sources: SFCTA CMP 2023 corridor speeds, Caltrans PeMS District 4.
CONGESTION_MULTIPLIERS = {
    "weekday_am_peak": 1.45,   # ~21 mph avg vs 30 mph free-flow
    "weekday_midday": 1.20,    # ~25 mph avg
    "weekday_pm_peak": 1.55,   # ~19 mph avg (worst)
    "weekday_night": 1.00,     # free flow
    "weekend_day": 1.15,       # light congestion
    "weekend_night": 1.00,     # free flow
}


def classify_slot(dow: int, hour: int) -> int:
    """
    Classify a (dow, hour) pair into a speed profile index.
    dow: 0=Mon..6=Sun (ISO 8601), hour: 0-23
    """
    is_weekend = dow >= 5  # Sat=5, Sun=6

    if is_weekend:
        if 8 <= hour < 20:
            return 4  # weekend_day
        return 5      # weekend_night

    # Weekday
    if 7 <= hour <= 9:
        return 0      # weekday_am_peak
    if 10 <= hour <= 15:
        return 1      # weekday_midday
    if 16 <= hour <= 19:
        return 2      # weekday_pm_peak
    return 3          # weekday_night


def main():
    out_dir = Path(__file__).parent.parent / "public" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Build 168-element mapping: slot index -> profile index
    profile_map = []
    for dow in range(7):
        for hour in range(24):
            profile_map.append(classify_slot(dow, hour))

    # Verify distribution
    from collections import Counter
    dist = Counter(profile_map)
    print("Speed profile distribution (168 slots):")
    for idx, name in enumerate(PROFILE_NAMES):
        count = dist.get(idx, 0)
        mult = CONGESTION_MULTIPLIERS[name]
        print(f"  [{idx}] {name}: {count} slots (congestion x{mult:.2f})")

    output = {
        "profiles": PROFILE_NAMES,
        "congestionMultipliers": {
            name: CONGESTION_MULTIPLIERS[name] for name in PROFILE_NAMES
        },
        "profileMap": profile_map,
    }

    out_path = out_dir / "speed_profiles.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nWrote {out_path} ({out_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
