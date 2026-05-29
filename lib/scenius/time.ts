/**
 * Time rendering. The DB stores a UTC instant (startsAt); the event's IANA zone
 * (tzid) is stored alongside so EVERY viewer sees the event's local wall-clock,
 * not their own timezone and not the server's. This is the fix for the
 * `withTimezone` data-loss class: the instant is correct, and tzid carries the
 * zone the wall-clock should be rendered in.
 */

const DEFAULT_TZ = "America/Denver"; // Boulder — used only if an event has no tzid

export function eventTz(tzid?: string | null): string {
  return tzid || DEFAULT_TZ;
}

/** "Thu, Jun 4, 6:00 PM MDT" — rendered in the event's own zone. */
export function formatEventDateTime(date: Date, tzid?: string | null): string {
  const tz = eventTz(tzid);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

/** Just the time, in the event's zone — "6:00 PM". */
export function formatEventTime(date: Date, tzid?: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: eventTz(tzid),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Weekday in the event's zone — "Thursday". */
export function formatWeekday(date: Date, tzid?: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: eventTz(tzid),
    weekday: "long",
  }).format(date);
}

/** { month: "JUN", day: 4 } in the event's zone — for the date-rail. */
export function dateRail(date: Date, tzid?: string | null): { month: string; day: string } {
  const tz = eventTz(tzid);
  const month = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" })
    .format(date)
    .toUpperCase();
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(date);
  return { month, day };
}
