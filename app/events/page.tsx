import Link from "next/link";
import { searchEvents, listLocalities } from "@/lib/scenius/discover";
import { dateRail, formatEventTime, formatWeekday } from "@/lib/scenius/time";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const city = sp.city?.trim() || undefined;

  const [results, localities] = await Promise.all([
    searchEvents({ q, locality: city, limit: 50 }),
    listLocalities(),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div className="animate-fade-up">
        <h1 className="font-display text-3xl font-500 sm:text-4xl">What&apos;s happening</h1>
        <p className="mt-2 text-text-secondary">
          Curated by scene builders across the network.
        </p>
      </div>

      {/* Filters */}
      <form className="mt-8 flex flex-wrap items-center gap-3 animate-fade-up stagger-1">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search events…"
          className="flex-1 min-w-[200px] rounded-xl border border-hairline bg-page px-4 py-2.5 text-sm placeholder:text-ink-3 focus:border-scenius-400 focus:outline-none"
        />
        <select
          name="city"
          defaultValue={city ?? ""}
          className="rounded-xl border border-hairline bg-page px-3 py-2.5 text-sm"
        >
          <option value="">All cities</option>
          {localities.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-page hover:bg-ink/90 transition-colors"
        >
          Search
        </button>
      </form>

      {/* Results */}
      <div className="mt-8 space-y-2">
        {results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-hairline bg-page/50 py-16 text-center">
            <p className="text-ink-3">
              {q || city ? "No events match your search." : "No curated events yet."}
            </p>
          </div>
        ) : (
          results.map((event, i) => {
            const { month, day } = dateRail(event.startsAt, event.tzid);
            return (
              <Link
                key={event.uri}
                href={`/e/${encodeURIComponent(event.uri)}`}
                className={`animate-fade-up stagger-${Math.min(i + 1, 6)} group flex items-center gap-5 rounded-xl border border-transparent bg-page px-5 py-4 transition-all hover:border-hairline hover:shadow-sm`}
              >
                <div className="flex flex-col items-center w-12 shrink-0">
                  <span className="kicker text-[10px] text-brick">{month}</span>
                  <span className="text-2xl font-600 leading-none mt-0.5 font-display">{day}</span>
                </div>
                <div className="w-px h-10 bg-hairline/60 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-snug group-hover:text-scenius-700 transition-colors">
                      {event.name}
                    </h3>
                    {event.pinned && (
                      <span className="shrink-0 rounded-full bg-ember-300/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-ember-600">
                        Pinned
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-sm text-text-secondary">
                    <span>
                      {formatWeekday(event.startsAt, event.tzid)}, {formatEventTime(event.startsAt, event.tzid)}
                    </span>
                    {event.locationName && (
                      <>
                        <span className="text-ink-3">&middot;</span>
                        <span className="text-ink-3 truncate">{event.locationName}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full bg-scenius-50 pl-2 pr-3 py-1 text-xs font-medium text-scenius-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-scenius-400" />
                  {event.sceneName}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
