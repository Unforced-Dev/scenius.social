import { db } from "@/lib/db";
import {
  scenes,
  events,
  eventContexts,
  memberships,
  accounts,
} from "@/lib/db/schema";
import { eq, and, gte, asc, count, sql } from "drizzle-orm";
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
          and(
            eq(eventContexts.sceneUri, scene.uri),
            gte(events.startsAt, now),
          ),
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
          and(
            eq(eventContexts.sceneUri, scene.uri),
            sql`${events.startsAt} < ${now}`,
          ),
        )
        .orderBy(sql`${events.startsAt} DESC`)
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

  const isMember = did
    ? memberRows.some((m) => m.memberDid === did)
    : false;

  return (
    <div className="min-h-screen">
      {/* Scene header */}
      <header className="border-b border-border bg-gradient-to-br from-scenius-50 via-surface to-surface">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="flex items-start justify-between">
            <div>
              {scene.type && (
                <span className="mb-2 inline-block rounded-full bg-scenius-100 px-2.5 py-0.5 text-xs font-medium text-scenius-700">
                  {scene.type}
                </span>
              )}
              <h1 className="text-3xl font-bold">{scene.name}</h1>
              {scene.locationLocality && (
                <p className="mt-1 text-text-secondary">
                  {[scene.locationLocality, scene.locationRegion]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              {scene.description && (
                <p className="mt-3 max-w-2xl text-text-secondary">
                  {scene.description}
                </p>
              )}
            </div>
          </div>
          <div className="mt-6 flex items-center gap-6 text-sm text-text-secondary">
            <span className="font-medium">
              {memberRows.length}{" "}
              {memberRows.length === 1 ? "member" : "members"}
            </span>
            <span>
              {upcomingEvents.length} upcoming{" "}
              {upcomingEvents.length === 1 ? "event" : "events"}
            </span>
          </div>
          {scene.tags && scene.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {scene.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-surface-raised px-3 py-0.5 text-xs font-medium text-text-secondary ring-1 ring-border"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Events column */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold">Upcoming</h2>
            {upcomingEvents.length === 0 ? (
              <p className="mt-4 text-sm text-text-tertiary">
                No upcoming events in this scene yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {upcomingEvents.map((event) => {
                  const date = event.startsAt;
                  const month = date.toLocaleDateString("en-US", {
                    month: "short",
                  });
                  const day = date.getDate();
                  const time = date.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  const weekday = date.toLocaleDateString("en-US", {
                    weekday: "long",
                  });

                  return (
                    <div
                      key={event.uri}
                      className="group flex gap-4 rounded-xl border border-border bg-surface-raised p-4 transition-shadow hover:shadow-md"
                    >
                      <div className="flex flex-col items-center pt-0.5">
                        <span className="text-xs font-medium uppercase text-scenius-600">
                          {month}
                        </span>
                        <span className="text-2xl font-bold leading-tight">
                          {day}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between">
                          <h3 className="font-semibold leading-snug group-hover:text-scenius-700 transition-colors">
                            {event.name}
                          </h3>
                          {event.pinned && (
                            <span className="ml-2 shrink-0 rounded bg-ember-500/10 px-1.5 py-0.5 text-xs font-medium text-ember-600">
                              Pinned
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-text-secondary">
                          {weekday}, {time}
                        </p>
                        {event.locationName && (
                          <p className="mt-1 text-sm text-text-tertiary">
                            {event.locationName}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Past events */}
            {pastEvents.length > 0 && (
              <div className="mt-12">
                <h2 className="text-lg font-semibold text-text-secondary">
                  Past
                </h2>
                <div className="mt-4 space-y-2">
                  {pastEvents.map((event) => (
                    <div
                      key={event.uri}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-secondary"
                    >
                      <span className="shrink-0 text-text-tertiary">
                        {event.startsAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="truncate">{event.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Builders */}
            {builderRows.length > 0 && (
              <div className="rounded-xl border border-border bg-surface-raised p-5">
                <h3 className="text-sm font-semibold text-text-secondary">
                  Scene Builders
                </h3>
                <ul className="mt-3 space-y-2">
                  {builderRows.map((b) => (
                    <li key={b.memberDid} className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-scenius-100 flex items-center justify-center">
                        <span className="text-xs font-medium text-scenius-700">
                          {(b.displayName || b.handle || "?")[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        {b.displayName && (
                          <p className="text-sm font-medium truncate">
                            {b.displayName}
                          </p>
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

            {/* Members preview */}
            <div className="rounded-xl border border-border bg-surface-raised p-5">
              <h3 className="text-sm font-semibold text-text-secondary">
                Members
              </h3>
              <div className="mt-3 flex flex-wrap gap-1">
                {memberRows.slice(0, 20).map((m) => (
                  <div
                    key={m.memberDid}
                    className="h-8 w-8 rounded-full bg-surface-sunken flex items-center justify-center"
                    title={`@${m.handle || m.memberDid}`}
                  >
                    <span className="text-xs font-medium text-text-tertiary">
                      {(m.displayName || m.handle || "?")[0]?.toUpperCase()}
                    </span>
                  </div>
                ))}
                {memberRows.length > 20 && (
                  <div className="h-8 w-8 rounded-full bg-surface-sunken flex items-center justify-center">
                    <span className="text-xs font-medium text-text-tertiary">
                      +{memberRows.length - 20}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* About */}
            <div className="rounded-xl border border-border bg-surface-raised p-5">
              <h3 className="text-sm font-semibold text-text-secondary">
                About
              </h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-text-tertiary">Membership</dt>
                  <dd className="font-medium capitalize">
                    {scene.memberPolicy}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Visibility</dt>
                  <dd className="font-medium capitalize">
                    {scene.visibility}
                  </dd>
                </div>
                {scene.locationLocality && (
                  <div>
                    <dt className="text-text-tertiary">Location</dt>
                    <dd className="font-medium">
                      {[
                        scene.locationLocality,
                        scene.locationRegion,
                        scene.locationCountry,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
