import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { scenes, memberships } from "@/lib/db/schema";
import { serializeScene } from "@/lib/scenius/api-serialize";

/** GET /api/v1/scenes/:handle — scene detail + builders. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const [scene] = await db
    .select()
    .from(scenes)
    .where(and(eq(scenes.handle, handle), eq(scenes.visibility, "public")))
    .limit(1);
  if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const builders = await db
    .select({ did: memberships.memberDid, role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.sceneUri, scene.uri)),
    );
  const buildersList = builders.filter((b) => ["builder", "facilitator", "steward"].includes(b.role));

  return NextResponse.json(
    {
      ...serializeScene({
        uri: scene.uri,
        name: scene.name,
        handle: scene.handle,
        description: scene.description,
        type: scene.type,
        locationLocality: scene.locationLocality,
        locationRegion: scene.locationRegion,
        memberCount: scene.memberCount,
        tags: scene.tags,
      }),
      memberPolicy: scene.memberPolicy,
      governanceMode: scene.governanceMode,
      builders: buildersList.map((b) => ({ did: b.did, role: b.role })),
    },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
