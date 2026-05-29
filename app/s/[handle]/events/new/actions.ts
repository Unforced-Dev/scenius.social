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

  // The browser computed the correct UTC instant in the organizer's zone and
  // sent it + the tzid. The server must NOT re-parse a naive local string.
  const startsAtUtc = (formData.get("startsAtUtc") as string)?.trim();
  if (!startsAtUtc) return { error: "Start date and time are required." };
  const startsAt = new Date(startsAtUtc);
  if (isNaN(startsAt.getTime())) return { error: "Invalid start date/time." };
  const endsAtUtc = (formData.get("endsAtUtc") as string)?.trim();
  const endsAt = endsAtUtc ? new Date(endsAtUtc) : undefined;
  const tzid = ((formData.get("tzid") as string) || "").trim() || undefined;

  const description = ((formData.get("description") as string) || "").trim();
  const mode = (formData.get("mode") as EventInput["mode"]) || "inperson";
  const locationName = ((formData.get("locationName") as string) || "").trim();
  const locality = ((formData.get("locality") as string) || "").trim();
  const virtualUri = ((formData.get("virtualUri") as string) || "").trim();

  const capacityRaw = ((formData.get("capacity") as string) || "").trim();
  const capacity = capacityRaw ? Number(capacityRaw) : undefined;
  const approvalRequired = formData.get("approvalRequired") === "on";
  const waitlistEnabled = formData.get("waitlistEnabled") === "on";

  const input: EventInput = {
    name,
    description: description || undefined,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt && !isNaN(endsAt.getTime()) ? endsAt.toISOString() : undefined,
    mode,
    location:
      locationName || locality
        ? { name: locationName || undefined, locality: locality || undefined }
        : undefined,
    virtualUri: virtualUri || undefined,
    capacity: capacity && capacity > 0 ? capacity : undefined,
    approvalRequired,
    waitlistEnabled,
    tzid,
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
