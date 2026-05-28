import { db } from "@/lib/db";
import {
  scenes,
  events,
  eventContexts,
  memberships,
  accounts,
} from "@/lib/db/schema";
import { eq, and, gte, lt, asc, desc } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDid } from "@/lib/auth/session";

export default async function ScenePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  const [scene] = await db
    .select()
    .from(scenes)
    .where(eq(scenes.handle, handle))
    .limit(1);

  if (!scene) notFound();

  const did = await getDid();
  const now = new Date();

  const [upcomingEvents, pastEvents, memberRows, builderRows] =
    await Promise.all([
      db
        .select({
          uri: events.uri,
          name: events.name,
          startsAt: events.startsAt,
          endsAt: events.endsAt,
          mode: events.mode,
          status: events.status,
          locationName: events.locationName,
          authorDid: events.authorDid,
          pinned: eventContexts.pinned,
        })
        .from(events)
        .innerJoin(eventContexts, eq(events.uri, eventContexts.eventUri))
        .where(
          and(eq(eventContexts.sceneUri, scene.uri), gte(events.startsAt, now)),
        )
        .orderBy(asc(events.startsAt))
        .limit(20),

      db
        .select({
          uri: events.uri,
          name: events.name,
          startsAt: events.startsAt,
          locationName: events.locationName,
        })
        .from(events)
        .innerJoin(eventContexts, eq(events.uri, eventContexts.eventUri))
        .where(
          and(eq(eventContexts.sceneUri, scene.uri), lt(events.startsAt, now)),
        )
        .orderBy(desc(events.startsAt))
        .limit(6),

      db
        .select({
          memberDid: memberships.memberDid,
          role: memberships.role,
          handle: accounts.handle,
          displayName: accounts.displayName,
        })
        .from(memberships)
        .leftJoin(accounts, eq(memberships.memberDid, accounts.did))
        .where(eq(memberships.sceneUri, scene.uri))
        .limit(50),

      db
        .select({
          memberDid: memberships.memberDid,
          handle: accounts.handle,
          displayName: accounts.displayName,
        })
        .from(memberships)
        .leftJoin(accounts, eq(memberships.memberDid, accounts.did))
        .where(
          and(
            eq(memberships.sceneUri, scene.uri),
            eq(memberships.role, "builder"),
          ),
        ),
    ]);

  const typeColors: Record<string, string> = {
    place: "bg-sage-50 text-sage-600 ring-sage-100",
    interest: "bg-scenius-50 text-scenius-600 ring-scenius-100",
    hybrid: "bg-ember-300/30 text-ember-600 ring-ember-300/40",
  };

  const avatarColors = [
    "bg-scenius-100 text-scenius-700",
    "bg-sage-100 text-sage-600",
    "bg-ember-300/40 text-ember-600",
    "bg-scenius-200/60 text-scenius-800",
    "bg-sage-50 text-sage-500",
  ];

  const canCurate = did
    ? memberRows.some(
        (m) =>
          m.memberDid === did &&
          ["builder", "facilitator", "steward"].includes(m.role),
      )
    : false;

  return (
    <div className="min-h-screen">
      {/* Scene header */}
      <header className="relative overflow-hidden border-b border-border/60">
        <div className="grain absolute inset-0 bg-gradient-to-br from-scenius-50/60 via-surface to-surface" />
        <div className="relative mx-auto max-w-6xl px-6 pt-10 pb-10 sm:pt-14 sm:pb-12">
          <div className="animate-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <Link href="/scenes" className="text-sm text-text-tertiary hover:text-text-secondary transition-colors">
                Scenes
              </Link>
              <span className="text-text-tertiary">/</span>
              {scene.type && (
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 ${typeColors[scene.type] || "bg-surface-sunken text-text-tertiary ring-border"}`}>
                  {scene.type}
                </span>
              )}
            </div>
            <h1 className="font-display text-4xl font-500 sm:text-5xl">{scene.name}</h1>
            {scene.locationLocality && (
              <p className="mt-2 text-text-secondary flex items-center gap-1.5">
                <svg className="h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                {[scene.locationLocality, scene.locationRegion].filter(Boolean).join(", ")}
              </p>
            )}
            {scene.description && (
              <p className="mt-4 max-w-2xl text-text-secondary leading-relaxed animate-fade-up stagger-1">
                {scene.description}
              </p>
            )}
          </div>

          <div className="mt-8 flex items-center gap-8 animate-fade-up stagger-2">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {memberRows.slice(0, 4).map((m, i) => (
                  <div
                    key={m.memberDid}
                    className={`h-7 w-7 rounded-full flex items-center justify-center ring-2 ring-surface ${avatarColors[i % avatarColors.length]}`}
                  >
                    <span className="text-[10px] font-semibold">
                      {(m.displayName || m.handle || "?")[0]?.toUpperCase()}
                    </span>
                  </div>
                ))}
                {memberRows.length > 4 && (
                  <div className="h-7 w-7 rounded-full bg-surface-sunken flex items-center justify-center ring-2 ring-surface">
                    <span className="text-[10px] font-medium text-text-tertiary">
                      +{memberRows.length - 4}
                    </span>
                  </div>
                )}
              </div>
              <span className="text-sm text-text-secondary">
                {memberRows.length} {memberRows.length === 1 ? "member" : "members"}
              </span>
            </div>
            <span className="text-sm text-text-tertiary">
              {upcomingEvents.length} upcoming
            </span>
            {scene.tags && scene.tags.length > 0 && (
              <div className="hidden sm:flex items-center gap-2">
                {scene.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-surface-raised px-2.5 py-0.5 text-xs text-text-tertiary ring-1 ring-border/60"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-10 lg:grid-cols-[1fr,320px]">
          {/* Events column */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl font-500">Upcoming</h2>
              {canCurate && (
                <Link
                  href={`/s/${handle}/events/new`}
                  className="rounded-lg bg-text px-3.5 py-1.5 text-sm font-medium text-surface-raised hover:bg-text/90 transition-colors shadow-sm"
                >
                  + Add event
                </Link>
              )}
            </div>
            {upcomingEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface-raised/50 py-12 text-center">
                <p className="text-sm text-text-tertiary">
                  No upcoming events in this scene yet.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map((event, i) => {
                  const date = event.startsAt;
                  const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
                  const day = date.getDate();
                  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });

                  return (
                    <div
                      key={event.uri}
                      className={`animate-fade-up stagger-${Math.min(i + 1, 6)} group flex items-center gap-5 rounded-xl border border-transparent bg-surface-raised px-5 py-4 transition-all hover:border-border hover:shadow-sm`}
                    >
                      <div className="flex flex-col items-center w-12 shrink-0">
                        <span className="text-[10px] font-semibold tracking-widest text-scenius-500">
                          {month}
                        </span>
                        <span className="text-2xl font-600 leading-none mt-0.5 font-display">{day}</span>
                      </div>
                      <div className="w-px h-10 bg-border/60 shrink-0" />
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
                          <span>{weekday}, {time}</span>
                          {event.locationName && (
                            <>
                              <span className="text-text-tertiary">&middot;</span>
                              <span className="text-text-tertiary truncate">{event.locationName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {pastEvents.length > 0 && (
              <div className="mt-14">
                <h2 className="font-display text-xl font-500 text-text-secondary mb-5">Past</h2>
                <div className="space-y-1">
                  {pastEvents.map((event) => (
                    <div
                      key={event.uri}
                      className="flex items-center gap-4 rounded-lg px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-sunken/50 transition-colors"
                    >
                      <span className="shrink-0 w-16 text-text-tertiary text-xs">
                        {event.startsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="truncate">{event.name}</span>
                      {event.locationName && (
                        <span className="hidden sm:block ml-auto shrink-0 text-xs text-text-tertiary">
                          {event.locationName}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-5">
            {/* Builders */}
            {builderRows.length > 0 && (
              <div className="rounded-2xl border border-border bg-surface-raised p-5">
                <h3 className="text-xs font-semibold tracking-wide uppercase text-text-tertiary mb-4">
                  Scene Builders
                </h3>
                <ul className="space-y-3">
                  {builderRows.map((b, i) => (
                    <li key={b.memberDid} className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center ${avatarColors[i % avatarColors.length]}`}>
                        <span className="text-xs font-semibold">
                          {(b.displayName || b.handle || "?")[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        {b.displayName && (
                          <p className="text-sm font-medium truncate">{b.displayName}</p>
                        )}
                        <p className="text-xs text-text-tertiary truncate">
                          @{b.handle || b.memberDid}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* About */}
            <div className="rounded-2xl border border-border bg-surface-raised p-5">
              <h3 className="text-xs font-semibold tracking-wide uppercase text-text-tertiary mb-4">
                About
              </h3>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-text-tertiary">Membership</dt>
                  <dd className="font-medium capitalize">{scene.memberPolicy}</dd>
                </div>
                <div className="h-px bg-border/60" />
                <div className="flex items-center justify-between">
                  <dt className="text-text-tertiary">Visibility</dt>
                  <dd className="font-medium capitalize">{scene.visibility}</dd>
                </div>
                {scene.locationLocality && (
                  <>
                    <div className="h-px bg-border/60" />
                    <div className="flex items-center justify-between">
                      <dt className="text-text-tertiary">Location</dt>
                      <dd className="font-medium">
                        {[scene.locationLocality, scene.locationRegion, scene.locationCountry].filter(Boolean).join(", ")}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>

            {/* Members */}
            <div className="rounded-2xl border border-border bg-surface-raised p-5">
              <h3 className="text-xs font-semibold tracking-wide uppercase text-text-tertiary mb-4">
                Members
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {memberRows.slice(0, 24).map((m, i) => (
                  <div
                    key={m.memberDid}
                    className={`h-8 w-8 rounded-full flex items-center justify-center cursor-default ${avatarColors[i % avatarColors.length]}`}
                    title={m.displayName || `@${m.handle}` || m.memberDid}
                  >
                    <span className="text-[10px] font-semibold">
                      {(m.displayName || m.handle || "?")[0]?.toUpperCase()}
                    </span>
                  </div>
                ))}
                {memberRows.length > 24 && (
                  <div className="h-8 w-8 rounded-full bg-surface-sunken flex items-center justify-center">
                    <span className="text-[10px] font-medium text-text-tertiary">
                      +{memberRows.length - 24}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
