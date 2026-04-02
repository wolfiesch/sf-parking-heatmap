const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_NAMES_FULL = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;

/** Short day name from ISO dow (0=Mon..6=Sun) */
export function dayName(dow: number): string {
  return DAY_NAMES[dow] ?? "?";
}

/** Full day name from ISO dow */
export function dayNameFull(dow: number): string {
  return DAY_NAMES_FULL[dow] ?? "?";
}

/** Format hour as "9 AM", "12 PM", etc. */
export function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

/** Format occupancy as percentage string */
export function formatOccupancy(occupancy: number, enforced = true): string {
  if (occupancy <= 0) return enforced ? "N/A" : "Free";
  return `${Math.round(occupancy * 100)}%`;
}

/** Format time slot as "Wednesday 2:00 PM" */
export function formatTimeSlot(dow: number, hour: number): string {
  return `${dayNameFull(dow)} ${formatHour(hour)}`;
}
