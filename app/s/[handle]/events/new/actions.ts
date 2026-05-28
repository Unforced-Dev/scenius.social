"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { scenes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthedAgent } from "@/lib/scenius/atproto";
import { createEvent, canCurate, type EventInput } from "@/lib/scenius/write";

export type CreateEventState = { error?: string };

export async function createEventAction(
  _prev: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  const auth = await getAuthedAgent();
  if (!auth) return { error: "You must be signed in to add an event." };

  const sceneHandle = formData.get("sceneHandle") as string;
  const [scene] = await db
    .select({ uri: scenes.uri })
    .from(scenes)
    .where(eq(scenes.handle, sceneHandle))
    .limit(1);
  if (!scene) return { error: "Scene not found." };

  // v0 administered gate: only builders/facilitators/stewards may curate
  const allowed = await canCurate(scene.uri, auth.did);
  if (!allowed) {
    return { error: "Only scene builders can add events to this scene." };
  }

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Event name is required." };

  const date = (formData.get("date") as string)?.trim();
  const startTime = (formData.get("startTime") as string)?.trim();
  if (!date || !startTime) return { error: "Start date and time are required." };

  const endTime = (formData.get("endTime") as string)?.trim();
  const description = ((formData.get("description") as string) || "").trim();
  const mode = (formData.get("mode") as EventInput["mode"]) || "inperson";
  const locationName = ((formData.get("locationName") as string) || "").trim();
  const virtualUri = ((formData.get("virtualUri") as string) || "").trim();

  // Build ISO timestamps from local date + time inputs
  const startsAt = new Date(`${date}T${startTime}`);
  if (isNaN(startsAt.getTime())) return { error: "Invalid start date/time." };
  let endsAt: Date | undefined;
  if (endTime) {
    const e = new Date(`${date}T${endTime}`);
    if (!isNaN(e.getTime())) endsAt = e;
  }

  const input: EventInput = {
    name,
    description: description || undefined,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt?.toISOString(),
    mode,
    location: locationName ? { name: locationName } : undefined,
    virtualUri: virtualUri || undefined,
  };

  try {
    await createEvent(auth.agent, auth.did, scene.uri, input);
  } catch (err) {
    console.error("createEvent failed:", err);
    return {
      error:
        err instanceof Error
          ? `Failed to create event: ${err.message}`
          : "Failed to create event.",
    };
  }

  redirect(`/s/${sceneHandle}`);
}
