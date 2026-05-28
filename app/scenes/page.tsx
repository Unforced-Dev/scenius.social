import { db } from "@/lib/db";
import { scenes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function ScenesPage() {
  const allScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.visibility, "public"));

  const typeColors: Record<string, string> = {
    place: "bg-sage-50 text-sage-600",
    interest: "bg-scenius-50 text-scenius-600",
    hybrid: "bg-ember-300/30 text-ember-600",
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <div className="animate-fade-up">
        <h1 className="font-display text-3xl font-500 sm:text-4xl">Scenes</h1>
        <p className="mt-2 text-text-secondary">
          Communities, neighborhoods, and interest groups gathering in Boulder.
        </p>
      </div>

      {allScenes.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-border bg-surface-raised/50 py-16 text-center animate-fade-up stagger-1">
          <p className="text-text-tertiary">
            No scenes yet. Sign in to create the first one.
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {allScenes.map((scene, i) => (
            <Link
              key={scene.uri}
              href={scene.handle ? `/s/${scene.handle}` : "#"}
              className={`animate-fade-up stagger-${Math.min(i + 1, 6)} group rounded-2xl border border-border bg-surface-raised p-6 transition-all hover:shadow-md hover:border-border/80`}
            >
              <div className="flex items-start justify-between">
                <h2 className="font-display text-xl font-500 group-hover:text-scenius-700 transition-colors">
                  {scene.name}
                </h2>
                {scene.type && (
                  <span className={`shrink-0 ml-3 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${typeColors[scene.type] || "bg-surface-sunken text-text-tertiary"}`}>
                    {scene.type}
                  </span>
                )}
              </div>
              {scene.locationLocality && (
                <p className="mt-1 text-sm text-text-tertiary flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                  {scene.locationLocality}
                </p>
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
                {scene.tags?.slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded-full bg-surface-sunken px-2 py-0.5">
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
