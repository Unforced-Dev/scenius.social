import { db } from "@/lib/db";
import { scenes, events, eventContexts, accounts, rsvps } from "@/lib/db/schema";
import { eq, gte, asc, sql, count } from "drizzle-orm";
import Link from "next/link";

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
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-scenius-50 via-surface to-surface" />
        <div className="relative mx-auto max-w-5xl px-4 py-24 sm:py-32">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Where scenes
            <br />
            <span className="text-scenius-600">come alive</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-text-secondary">
            Discover and coordinate with the communities that matter to you.
            Events, people, and places — organized by scenes, not algorithms.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              href="/scenes"
              className="rounded-full bg-scenius-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-scenius-700 transition-colors"
            >
              Explore scenes
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-surface-raised px-6 py-2.5 text-sm font-semibold text-text shadow-sm ring-1 ring-border hover:bg-surface-sunken transition-colors"
            >
              Sign in with Bluesky
            </Link>
          </div>
        </div>
      </section>

      {/* Upcoming events */}
      {upcomingEvents.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-16">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Upcoming</h2>
            <Link
              href="/events"
              className="text-sm font-medium text-scenius-600 hover:text-scenius-700"
            >
              View all
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingEvents.map((event) => (
              <EventCard key={event.uri} event={event} />
            ))}
          </div>
        </section>
      )}

      {/* Scenes */}
      {featuredScenes.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-16">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Scenes</h2>
            <Link
              href="/scenes"
              className="text-sm font-medium text-scenius-600 hover:text-scenius-700"
            >
              View all
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredScenes.map((scene) => (
              <SceneCard key={scene.uri} scene={scene} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {upcomingEvents.length === 0 && featuredScenes.length === 0 && (
        <section className="mx-auto max-w-5xl px-4 py-24 text-center">
          <div className="mx-auto max-w-md">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-scenius-100">
              <svg
                className="h-8 w-8 text-scenius-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">No scenes yet</h2>
            <p className="mt-2 text-text-secondary">
              scenius is just getting started. Sign in to create the first scene
              and start building your community.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function EventCard({
  event,
}: {
  event: {
    uri: string;
    name: string;
    startsAt: Date;
    endsAt: Date | null;
    mode: string | null;
    locationName: string | null;
    locationLocality: string | null;
    sceneName: string;
    sceneHandle: string | null;
  };
}) {
  const date = event.startsAt;
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });

  return (
    <div className="group rounded-xl border border-border bg-surface-raised p-4 transition-shadow hover:shadow-md">
      <div className="flex gap-4">
        <div className="flex flex-col items-center">
          <span className="text-xs font-medium uppercase text-scenius-600">
            {month}
          </span>
          <span className="text-2xl font-bold leading-tight">{day}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug group-hover:text-scenius-700 transition-colors truncate">
            {event.name}
          </h3>
          <p className="mt-0.5 text-sm text-text-secondary">
            {weekday} {time}
          </p>
          {event.locationName && (
            <p className="mt-1 text-sm text-text-tertiary truncate">
              {event.locationName}
            </p>
          )}
          <div className="mt-2">
            <span className="inline-flex items-center rounded-full bg-scenius-50 px-2 py-0.5 text-xs font-medium text-scenius-700">
              {event.sceneName}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SceneCard({
  scene,
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
}) {
  const href = scene.handle ? `/${scene.handle}` : "#";

  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-surface-raised p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold group-hover:text-scenius-700 transition-colors">
            {scene.name}
          </h3>
          {scene.locationLocality && (
            <p className="mt-0.5 text-sm text-text-secondary">
              {scene.locationLocality}
            </p>
          )}
        </div>
        {scene.type && (
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-tertiary">
            {scene.type}
          </span>
        )}
      </div>
      {scene.description && (
        <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
          {scene.description}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-text-tertiary">
        <span>{scene.memberCount} members</span>
        {scene.tags?.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-scenius-50 px-2 py-0.5 text-scenius-700"
          >
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}
