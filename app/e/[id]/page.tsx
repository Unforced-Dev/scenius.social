import { db } from "@/lib/db";
import { events, eventContexts, scenes, accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDid } from "@/lib/auth/session";
import { getEventCapacity, getSeatState } from "@/lib/scenius/queries";
import { RsvpButton } from "@/components/RsvpButton";
import Link from "next/link";

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventUri = decodeURIComponent(id);

  const [event] = await db.select().from(events).where(eq(events.uri, eventUri)).limit(1);
  if (!event) notFound();

  const did = await getDid();

  const [sceneContext, capacity, hostAccount, seat] = await Promise.all([
    db
      .select({
        sceneName: scenes.name,
        sceneHandle: scenes.handle,
        sceneUri: scenes.uri,
      })
      .from(eventContexts)
      .innerJoin(scenes, eq(eventContexts.sceneUri, scenes.uri))
      .where(eq(eventContexts.eventUri, event.uri))
      .limit(1)
      .then((rows) => rows[0] ?? null),

    getEventCapacity(event.uri),

    db
      .select()
      .from(accounts)
      .where(eq(accounts.did, event.authorDid))
      .limit(1)
      .then((rows) => rows[0] ?? null),

    did ? getSeatState(event.uri, did) : null,
  ]);

  const goingCount = capacity?.confirmed ?? 0;
  const waitlistCount = capacity?.waitlisted ?? 0;
  const full =
    capacity?.capacity != null && capacity.confirmed >= capacity.capacity;

  const date = event.startsAt;
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const startTime = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = event.endsAt?.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const isCancelled = event.status === "cancelled" || event.cancelledAt;

  return (
    <div className="min-h-screen">
      {/* Event header */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-12">
          {sceneContext && (
            <Link
              href={`/s/${sceneContext.sceneHandle}`}
              className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-scenius-50 px-3 py-1 text-xs font-medium text-scenius-700 hover:bg-scenius-100 transition-colors"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                />
              </svg>
              {sceneContext.sceneName}
            </Link>
          )}

          {isCancelled && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
              <span className="font-semibold">Cancelled</span>
              {event.cancellationReason && (
                <span> — {event.cancellationReason}</span>
              )}
            </div>
          )}

          <h1
            className={`text-3xl font-bold ${isCancelled ? "line-through text-text-tertiary" : ""}`}
          >
            {event.name}
          </h1>

          <div className="mt-4 space-y-2 text-text-secondary">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-text-tertiary"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                />
              </svg>
              <span>
                {weekday}, {monthDay}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-text-tertiary"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
              <span>
                {startTime}
                {endTime ? ` – ${endTime}` : ""}
              </span>
            </div>
            {event.locationName && (
              <div className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-text-tertiary"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                  />
                </svg>
                <span>{event.locationName}</span>
              </div>
            )}
            {event.mode === "virtual" && event.virtualUri && (
              <div className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-text-tertiary"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
                <span>Online</span>
              </div>
            )}
          </div>

          {/* Host */}
          <div className="mt-6 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-scenius-100 flex items-center justify-center">
              <span className="text-sm font-semibold text-scenius-700">
                {(
                  hostAccount?.displayName ||
                  hostAccount?.handle ||
                  "?"
                )[0]?.toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Hosted by</p>
              <p className="text-sm font-medium">
                {hostAccount?.displayName || `@${hostAccount?.handle}` || event.authorDid}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Event body */}
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {event.description && (
              <div className="prose prose-stone max-w-none">
                <p className="whitespace-pre-wrap text-text-secondary">
                  {event.description}
                </p>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            {/* RSVP card */}
            {!isCancelled && (
              <div className="rounded-2xl border border-hairline bg-page p-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">Attending</h3>
                  <span className="font-display text-2xl font-600 text-ink">
                    {goingCount}
                    {capacity?.capacity != null && (
                      <span className="text-ink-3 text-base font-400"> / {capacity.capacity}</span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  {capacity?.capacity != null && capacity.spotsLeft != null
                    ? full
                      ? "Full"
                      : `${capacity.spotsLeft} ${capacity.spotsLeft === 1 ? "spot" : "spots"} left`
                    : "Open"}
                  {waitlistCount > 0 ? ` · ${waitlistCount} waitlisted` : ""}
                </p>

                <div className="mt-4">
                  {did ? (
                    <RsvpButton
                      eventUri={event.uri}
                      seat={seat}
                      approvalRequired={capacity?.approvalRequired ?? false}
                      full={full}
                    />
                  ) : (
                    <Link
                      href="/login"
                      className="block w-full rounded-lg bg-ink py-2.5 text-center text-sm font-semibold text-page hover:bg-ink/90 transition-colors"
                    >
                      Sign in to RSVP
                    </Link>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
