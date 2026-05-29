/**
 * Minimal iCalendar parser — enough to import a Luma (or any) .ics feed:
 * VEVENT blocks → { uid, summary, start, end?, tzid?, location?, description? }.
 * Handles UTC (…Z), TZID-qualified wall times, and all-day VALUE=DATE.
 */

export type ParsedEvent = {
  uid?: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
  tzid?: string;
  cancelled?: boolean;
};

/** Wall time in an IANA zone → the correct UTC instant (DST-aware via offset). */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const naive = new Date(asUtc);
  const tzMs = new Date(naive.toLocaleString("en-US", { timeZone: tz })).getTime();
  const utcMs = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(asUtc - (tzMs - utcMs));
}

function unfold(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescape(s: string): string {
  return s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseDt(value: string, params: Record<string, string>): { date: Date; tzid?: string } | null {
  // value like 20260915T190000, 20260915T010000Z, or 20260915 (all-day)
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  const Y = +y, MO = +mo, D = +d, H = +h, MI = +mi, S = +s;
  if (z) return { date: new Date(Date.UTC(Y, MO - 1, D, H, MI, S)) };
  if (params.TZID) return { date: zonedToUtc(Y, MO, D, H, MI, S, params.TZID), tzid: params.TZID };
  // floating / all-day → treat the wall numbers as UTC (best-effort)
  return { date: new Date(Date.UTC(Y, MO - 1, D, H, MI, S)) };
}

export function parseIcs(text: string): ParsedEvent[] {
  const lines = unfold(text);
  const events: ParsedEvent[] = [];
  let cur: Partial<ParsedEvent> & { _start?: Date } | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur && cur.summary && cur.start) {
        events.push(cur as ParsedEvent);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...paramParts] = left.split(";");
    const params: Record<string, string> = {};
    for (const pp of paramParts) {
      const eq = pp.indexOf("=");
      if (eq > 0) params[pp.slice(0, eq).toUpperCase()] = pp.slice(eq + 1);
    }

    switch (name.toUpperCase()) {
      case "UID":
        cur.uid = value;
        break;
      case "SUMMARY":
        cur.summary = unescape(value);
        break;
      case "DESCRIPTION":
        cur.description = unescape(value);
        break;
      case "LOCATION":
        cur.location = unescape(value);
        break;
      case "STATUS":
        if (value.toUpperCase() === "CANCELLED") cur.cancelled = true;
        break;
      case "DTSTART": {
        const p = parseDt(value, params);
        if (p) { cur.start = p.date; if (p.tzid) cur.tzid = p.tzid; }
        break;
      }
      case "DTEND": {
        const p = parseDt(value, params);
        if (p) cur.end = p.date;
        break;
      }
    }
  }
  return events;
}
