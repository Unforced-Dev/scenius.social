import { db } from "@/lib/db";
import { scenes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getDid } from "@/lib/auth/session";
import { canCurate } from "@/lib/scenius/write";
import { CreateEventForm } from "@/components/CreateEventForm";

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  const [scene] = await db
    .select({ uri: scenes.uri, name: scenes.name })
    .from(scenes)
    .where(eq(scenes.handle, handle))
    .limit(1);
  if (!scene) notFound();

  const did = await getDid();
  if (!did) redirect("/login");

  const allowed = await canCurate(scene.uri, did);
  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center animate-fade-up">
        <h1 className="font-display text-2xl font-500">Builders only</h1>
        <p className="mt-2 text-text-secondary">
          Only builders of <span className="font-medium">{scene.name}</span> can add
          events to its calendar.
        </p>
        <Link
          href={`/s/${handle}`}
          className="mt-6 inline-block rounded-xl px-6 py-2.5 text-sm font-semibold text-text ring-1 ring-border hover:bg-surface-raised transition-colors"
        >
          ← Back to {scene.name}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12 sm:py-16">
      <div className="animate-fade-up">
        <Link
          href={`/s/${handle}`}
          className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
        >
          ← {scene.name}
        </Link>
        <h1 className="mt-3 font-display text-3xl font-500">Add an event</h1>
        <p className="mt-2 text-text-secondary">
          This event will appear on the <span className="font-medium">{scene.name}</span>{" "}
          calendar.
        </p>
      </div>
      <div className="mt-8 rounded-2xl border border-border bg-surface-raised p-6 shadow-sm animate-fade-up stagger-1">
        <CreateEventForm sceneHandle={handle} />
      </div>
    </div>
  );
}
