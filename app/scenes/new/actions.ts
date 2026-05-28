"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { scenes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthedAgent } from "@/lib/scenius/atproto";
import { createScene, type SceneInput } from "@/lib/scenius/write";

export type CreateSceneState = { error?: string };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

export async function createSceneAction(
  _prev: CreateSceneState,
  formData: FormData,
): Promise<CreateSceneState> {
  const auth = await getAuthedAgent();
  if (!auth) return { error: "You must be signed in to create a scene." };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name is required." };

  const handle = slugify((formData.get("handle") as string) || name);
  if (!handle) return { error: "Could not derive a valid handle from the name." };

  // Handle uniqueness check (v0 — best-effort against our index)
  const [existing] = await db
    .select({ uri: scenes.uri })
    .from(scenes)
    .where(eq(scenes.handle, handle))
    .limit(1);
  if (existing) {
    return { error: `The handle "${handle}" is taken. Try a different name.` };
  }

  const type = (formData.get("type") as SceneInput["type"]) || "interest";
  const description = ((formData.get("description") as string) || "").trim();
  const visibility =
    (formData.get("visibility") as SceneInput["visibility"]) || "public";

  const locality = ((formData.get("locality") as string) || "").trim();
  const region = ((formData.get("region") as string) || "").trim();
  const locationName = ((formData.get("locationName") as string) || "").trim();

  const input: SceneInput = {
    name,
    handle,
    description: description || undefined,
    type,
    visibility,
    memberPolicy: "invite", // v0: administered scenes are invite-based
    governanceMode: "administered",
    location:
      locality || locationName
        ? {
            name: locationName || undefined,
            locality: locality || undefined,
            region: region || undefined,
            country: locality ? "US" : undefined,
          }
        : undefined,
  };

  try {
    await createScene(auth.agent, auth.did, input);
  } catch (err) {
    console.error("createScene failed:", err);
    return {
      error:
        err instanceof Error
          ? `Failed to create scene: ${err.message}`
          : "Failed to create scene.",
    };
  }

  redirect(`/s/${handle}`);
}
