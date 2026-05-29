/**
 * iCalendar (RFC 5545) export. Per-scene and per-event feeds so anyone can
 * subscribe in Apple/Google/Outlook. DTSTART is emitted as a UTC instant (with
 * Z) — the standard, portable choice; calendar clients render in the
 * subscriber's local zone. The stable UID is the event's at:// URI, which is
 * portable identity (a dividend Luma can't offer). Cancellations carry
 * STATUS:CANCELLED so they disappear.
 */

const PUBLIC_URL = process.env.PUBLIC_URL || "http://127.0.0.1:3000";

export type IcsEvent = {
  uri: string;
  name: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  locationName: string | null;
  status: string;
  cancelledAt: Date | null;
};

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function utc(d: Date): string {
  // YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Fold lines to 75 octets per RFC 5545 (continuation lines start with a space). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  out.push(line.slice(0, 75));
  i = 75;
  while (i < line.length) {
    out.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return out.join("\r\n");
}

function vevent(e: IcsEvent): string {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.uri.replace(/[^a-zA-Z0-9:/._-]/g, "")}@scenius.social`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(e.startsAt)}`,
    e.endsAt ? `DTEND:${utc(e.endsAt)}` : "",
    `SUMMARY:${escapeText(e.name)}`,
    e.description ? `DESCRIPTION:${escapeText(e.description)}` : "",
    e.locationName ? `LOCATION:${escapeText(e.locationName)}` : "",
    `STATUS:${e.cancelledAt || e.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    `URL:${PUBLIC_URL}/e/${encodeURIComponent(e.uri)}`,
    "END:VEVENT",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n");
}

export function buildCalendar(name: string, events: IcsEvent[]): string {
  const head = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//scenius.social//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${escapeText(name)}`),
  ];
  const body = events.map(vevent);
  return [...head, ...body, "END:VCALENDAR"].join("\r\n") + "\r\n";
}
