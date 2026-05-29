import { db } from "@/lib/db";
import { scenes, events, eventContexts } from "@/lib/db/schema";
import { eq, gte, asc } from "drizzle-orm";
import Link from "next/link";
import { dateRail, formatEventTime, eventTz } from "@/lib/scenius/time";

export default async function Home() {
  const now = new Date();

  const upcomingEvents = await db
    .select({
      uri: events.uri,
      name: events.name,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      mode: events.mode,
      locationName: events.locationName,
      locationLocality: events.locationLocality,
      tzid: events.tzid,
      authorDid: events.authorDid,
      sceneName: scenes.name,
      sceneHandle: scenes.handle,
    })
    .from(events)
    .innerJoin(eventContexts, eq(events.uri, eventContexts.eventUri))
    .innerJoin(scenes, eq(eventContexts.sceneUri, scenes.uri))
    .where(gte(events.startsAt, now))
    .orderBy(asc(events.startsAt))
    .limit(12);

  const featuredScenes = await db
    .select({
      uri: scenes.uri,
      name: scenes.name,
      handle: scenes.handle,
      description: scenes.description,
      type: scenes.type,
      locationLocality: scenes.locationLocality,
      memberCount: scenes.memberCount,
      tags: scenes.tags,
    })
    .from(scenes)
    .where(eq(scenes.visibility, "public"))
    .limit(6);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="grain absolute inset-0 bg-gradient-to-b from-page via-paper to-paper" />
        <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-20">
          <div className="max-w-2xl animate-fade-up">
            <h1 className="font-display text-5xl font-500 tracking-tight sm:text-6xl lg:text-7xl text-balance leading-[1.1]">
              Where scenes{" "}
              <em className="not-italic text-scenius-600">come alive</em>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-text-secondary sm:text-xl animate-fade-up stagger-1">
              Discover and coordinate with the communities that matter to you.
              Events, people, and places — organized by scenes, not algorithms.
            </p>
            <div className="mt-10 flex flex-wrap gap-3 animate-fade-up stagger-2">
              <Link
                href="/scenes"
                className="rounded-lg bg-text px-6 py-3 text-sm font-semibold text-surface-raised shadow-md hover:shadow-lg hover:bg-text/90 transition-all"
              >
                Explore scenes
              </Link>
              <Link
                href="/login"
                className="rounded-lg px-6 py-3 text-sm font-semibold text-text ring-1 ring-border hover:ring-text/20 hover:bg-surface-raised transition-all"
              >
                Sign in with Bluesky
              </Link>
            </div>
          </div>
        </div>
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>
      </section>

      {/* Upcoming events */}
      {upcomingEvents.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="font-display text-2xl font-500 sm:text-3xl">Upcoming</h2>
              <p className="mt-1 text-sm text-text-tertiary">What&apos;s happening soon</p>
            </div>
            <Link
              href="/events"
              className="text-sm font-medium text-text-secondary hover:text-text transition-colors"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="space-y-2">
            {upcomingEvents.map((event, i) => (
              <EventRow key={event.uri} event={event} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Scenes */}
      {featuredScenes.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="font-display text-2xl font-500 sm:text-3xl">Scenes</h2>
              <p className="mt-1 text-sm text-text-tertiary">Communities gathering in Boulder</p>
            </div>
            <Link
              href="/scenes"
              className="text-sm font-medium text-text-secondary hover:text-text transition-colors"
            >
              View all &rarr;
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {featuredScenes.map((scene, i) => (
              <SceneCard key={scene.uri} scene={scene} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {upcomingEvents.length === 0 && featuredScenes.length === 0 && (
        <section className="mx-auto max-w-6xl px-6 py-32 text-center">
          <div className="mx-auto max-w-md animate-fade-up">
            <div className="mx-auto mb-6 h-20 w-20 rounded-2xl bg-scenius-100/60 flex items-center justify-center">
              <svg className="h-10 w-10 text-scenius-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
            </div>
            <h2 className="font-display text-2xl font-500">No scenes yet</h2>
            <p className="mt-3 text-text-secondary">
              scenius is just getting started. Sign in to create the first scene and begin building your community.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function EventRow({
  event,
  index,
}: {
  event: {
    uri: string;
    name: string;
    startsAt: Date;
    endsAt: Date | null;
    mode: string | null;
    locationName: string | null;
    locationLocality: string | null;
    tzid: string | null;
    sceneName: string;
    sceneHandle: string | null;
  };
  index: number;
}) {
  const date = event.startsAt;
  const { month, day } = dateRail(date, event.tzid);
  const time = formatEventTime(date, event.tzid);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: eventTz(event.tzid),
    weekday: "short",
  }).format(date);

  return (
    <Link
      href={`/e/${encodeURIComponent(event.uri)}`}
      className={`animate-fade-up stagger-${Math.min(index + 1, 6)} group flex items-center gap-5 rounded-xl border border-transparent bg-surface-raised px-5 py-4 transition-all hover:border-border hover:shadow-sm`}
    >
      {/* Date block */}
      <div className="flex flex-col items-center w-12 shrink-0">
        <span className="kicker text-[10px] text-brick">{month}</span>
        <span className="text-2xl font-600 leading-none mt-0.5 font-display">{day}</span>
      </div>

      {/* Divider */}
      <div className="w-px h-10 bg-border/60 shrink-0" />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold leading-snug group-hover:text-scenius-700 transition-colors truncate">
          {event.name}
        </h3>
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

      {/* Scene tag */}
      <span className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full bg-scenius-50 pl-2 pr-3 py-1 text-xs font-medium text-scenius-700">
        <span className="h-1.5 w-1.5 rounded-full bg-scenius-400" />
        {event.sceneName}
      </span>
    </Link>
  );
}

function SceneCard({
  scene,
  index,
}: {
  scene: {
    uri: string;
    name: string;
    handle: string | null;
    description: string | null;
    type: string | null;
    locationLocality: string | null;
    memberCount: number;
    tags: string[] | null;
  };
  index: number;
}) {
  const href = scene.handle ? `/s/${scene.handle}` : "#";
  const typeColors: Record<string, string> = {
    place: "bg-moss/10 text-moss ring-1 ring-moss/20",
    interest: "bg-sky/10 text-sky ring-1 ring-sky/20",
    hybrid: "bg-brick/10 text-brick ring-1 ring-brick/20",
  };

  return (
    <Link
      href={href}
      className={`animate-fade-up stagger-${Math.min(index + 1, 6)} group relative rounded-2xl border border-border bg-surface-raised p-6 transition-all hover:shadow-md hover:border-border/80`}
    >
      <div className="flex items-start justify-between">
        <h3 className="font-display text-xl font-500 group-hover:text-scenius-700 transition-colors">
          {scene.name}
        </h3>
        {scene.type && (
          <span className={`kicker shrink-0 ml-3 rounded-sm px-2 py-0.5 text-[10px] font-medium ${typeColors[scene.type] || "bg-sunken text-ink-3"}`}>
            {scene.type}
          </span>
        )}
      </div>
      {scene.locationLocality && (
        <p className="mt-1 text-sm text-text-tertiary">{scene.locationLocality}</p>
      )}
      {scene.description && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-text-secondary">
          {scene.description}
        </p>
      )}
      <div className="mt-4 flex items-center gap-4 text-xs text-text-tertiary">
        <span className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
          {scene.memberCount} members
        </span>
        {scene.tags?.slice(0, 2).map((tag) => (
          <span key={tag} className="rounded-full bg-surface-sunken px-2 py-0.5">
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}
