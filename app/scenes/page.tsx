import { db } from "@/lib/db";
import { scenes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function ScenesPage() {
  const allScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.visibility, "public"));

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-bold">Scenes</h1>
      <p className="mt-2 text-text-secondary">
        Discover communities, neighborhoods, and interest groups.
      </p>

      {allScenes.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-text-tertiary">
            No scenes yet. Sign in to create the first one.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allScenes.map((scene) => (
            <Link
              key={scene.uri}
              href={scene.handle ? `/s/${scene.handle}` : "#"}
              className="group rounded-xl border border-border bg-surface-raised p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold group-hover:text-scenius-700 transition-colors">
                    {scene.name}
                  </h2>
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
          ))}
        </div>
      )}
    </div>
  );
}
