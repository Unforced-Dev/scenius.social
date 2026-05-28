import { NextRequest, NextResponse } from "next/server";
import { parseTapEvent, assureAdminAuth } from "@atproto/tap";
import { AtUri } from "@atproto/syntax";
import { db } from "@/lib/db";
import { accounts, events, rsvps, scenes, memberships, attestations, eventContexts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { recomputeMemberCount, canCurate, canManageMembers } from "@/lib/scenius/write";

const TAP_ADMIN_PASSWORD = process.env.TAP_ADMIN_PASSWORD;

export async function POST(request: NextRequest) {
  if (TAP_ADMIN_PASSWORD) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      assureAdminAuth(TAP_ADMIN_PASSWORD, authHeader);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json();
  const evt = parseTapEvent(body);

  if (evt.type === "identity") {
    if (evt.status === "deleted") {
      await db.delete(accounts).where(eq(accounts.did, evt.did));
    } else {
      await db
        .insert(accounts)
        .values({
          did: evt.did,
          handle: evt.handle,
          active: evt.isActive,
        })
        .onConflictDoUpdate({
          target: accounts.did,
          set: { handle: evt.handle, active: evt.isActive },
        });
    }
  }

  if (evt.type === "record") {
    const uri = AtUri.make(evt.did, evt.collection, evt.rkey);
    const now = new Date();

    if (evt.action === "delete") {
      await handleDelete(uri);
      return NextResponse.json({ success: true });
    }

    const record = evt.record as Record<string, unknown>;

    switch (evt.collection) {
      case "community.lexicon.calendar.event":
        await handleEvent(uri, evt.did, record, now);
        break;
      case "community.lexicon.calendar.rsvp":
        await handleRsvp(uri, evt.did, record, now);
        break;
      case "social.scenius.scene":
        await handleScene(uri, evt.did, record, now);
        break;
      case "social.scenius.membership":
        await handleMembership(uri, evt.did, record, now);
        break;
      case "social.scenius.attestation":
        await handleAttestation(uri, evt.did, record, now);
        break;
      case "social.scenius.eventContext":
        await handleEventContext(uri, evt.did, record, now);
        break;
    }
  }

  return NextResponse.json({ success: true });
}

async function handleEvent(uri: AtUri, did: string, record: Record<string, unknown>, now: Date) {
  const locations = record.locations as Array<Record<string, unknown>> | undefined;
  let locationName: string | undefined;
  let locationLat: string | undefined;
  let locationLon: string | undefined;
  let locationLocality: string | undefined;
  let locationAddress: string | undefined;

  if (locations?.length) {
    const loc = locations[0];
    locationName = loc.name as string | undefined;
    if ("lat" in loc) {
      locationLat = loc.lat as string;
      locationLon = loc.lon as string;
    }
    if ("locality" in loc) {
      locationLocality = loc.locality as string;
      locationAddress = loc.street as string;
    }
  }

  const uris = record.uris as string[] | undefined;
  const virtualUri = uris?.find(
    (u: string) => u.startsWith("https://zoom.") || u.startsWith("https://meet."),
  );

  await db
    .insert(events)
    .values({
      uri: uri.toString(),
      authorDid: did,
      name: record.name as string,
      description: record.description as string | undefined,
      startsAt: new Date(record.startsAt as string),
      endsAt: record.endsAt ? new Date(record.endsAt as string) : null,
      mode: record.mode as string | undefined,
      status: (record.status as string) || "scheduled",
      locationName,
      locationLat,
      locationLon,
      locationLocality,
      locationAddress,
      virtualUri,
      createdAt: new Date(record.createdAt as string),
      indexedAt: now,
    })
    .onConflictDoUpdate({
      target: events.uri,
      set: {
        name: record.name as string,
        description: record.description as string | undefined,
        startsAt: new Date(record.startsAt as string),
        endsAt: record.endsAt ? new Date(record.endsAt as string) : null,
        mode: record.mode as string | undefined,
        status: (record.status as string) || "scheduled",
        locationName,
        locationLat,
        locationLon,
        locationLocality,
        locationAddress,
        virtualUri,
        indexedAt: now,
      },
    });
}

async function handleRsvp(uri: AtUri, did: string, record: Record<string, unknown>, now: Date) {
  const subject = record.subject as { uri: string };
  await db
    .insert(rsvps)
    .values({
      uri: uri.toString(),
      authorDid: did,
      eventUri: subject.uri,
      status: record.status as string,
      createdAt: new Date(record.createdAt as string),
      indexedAt: now,
    })
    .onConflictDoUpdate({
      target: rsvps.uri,
      set: {
        status: record.status as string,
        indexedAt: now,
      },
    });
}

async function handleScene(uri: AtUri, did: string, record: Record<string, unknown>, now: Date) {
  const location = record.location as Record<string, unknown> | undefined;

  await db
    .insert(scenes)
    .values({
      uri: uri.toString(),
      authorDid: did,
      name: record.name as string,
      handle: record.handle as string | undefined,
      description: record.description as string | undefined,
      type: record.type as string | undefined,
      visibility: (record.visibility as string) || "public",
      memberPolicy: (record.memberPolicy as string) || "attestation",
      governanceMode: (record.governanceMode as string) || "administered",
      locationName: location?.name as string | undefined,
      locationLat: location?.lat as string | undefined,
      locationLon: location?.lon as string | undefined,
      locationLocality: location?.locality as string | undefined,
      locationCountry: location?.country as string | undefined,
      tags: record.tags as string[] | undefined,
      createdAt: new Date(record.createdAt as string),
      indexedAt: now,
    })
    .onConflictDoUpdate({
      target: scenes.uri,
      set: {
        name: record.name as string,
        handle: record.handle as string | undefined,
        description: record.description as string | undefined,
        type: record.type as string | undefined,
        visibility: (record.visibility as string) || "public",
        memberPolicy: (record.memberPolicy as string) || "attestation",
        governanceMode: (record.governanceMode as string) || "administered",
        locationName: location?.name as string | undefined,
        locationLat: location?.lat as string | undefined,
        locationLon: location?.lon as string | undefined,
        locationLocality: location?.locality as string | undefined,
        locationCountry: location?.country as string | undefined,
        tags: record.tags as string[] | undefined,
        indexedAt: now,
      },
    });
}

async function handleMembership(uri: AtUri, did: string, record: Record<string, unknown>, now: Date) {
  const scene = record.scene as { uri: string };

  // AUTHORIZATION: a membership record is only trustworthy if its author is
  // allowed to manage the scene's roster — the scene owner (bootstrap) or an
  // existing facilitator/steward. Otherwise anyone could write a membership to
  // their own PDS claiming a curation role and have us index it. Drop it.
  const [sceneRow] = await db
    .select({ authorDid: scenes.authorDid })
    .from(scenes)
    .where(eq(scenes.uri, scene.uri))
    .limit(1);
  const isOwner = sceneRow?.authorDid === did;
  if (!isOwner && !(await canManageMembers(scene.uri, did))) {
    console.warn(
      `Rejected unauthorized membership ${uri.toString()} from ${did} for scene ${scene.uri}`,
    );
    return;
  }

  await db
    .insert(memberships)
    .values({
      uri: uri.toString(),
      authorDid: did,
      sceneUri: scene.uri,
      memberDid: record.member as string,
      role: (record.role as string) || "member",
      createdAt: new Date(record.createdAt as string),
      indexedAt: now,
    })
    .onConflictDoUpdate({
      target: memberships.uri,
      set: {
        role: (record.role as string) || "member",
        indexedAt: now,
      },
    });

  await recomputeMemberCount(scene.uri);
}

async function handleAttestation(uri: AtUri, did: string, record: Record<string, unknown>, now: Date) {
  const scene = record.scene as { uri: string };
  await db
    .insert(attestations)
    .values({
      uri: uri.toString(),
      authorDid: did,
      sceneUri: scene.uri,
      subjectDid: record.subject as string,
      statement: record.statement as string | undefined,
      createdAt: new Date(record.createdAt as string),
      indexedAt: now,
    })
    .onConflictDoUpdate({
      target: attestations.uri,
      set: {
        statement: record.statement as string | undefined,
        indexedAt: now,
      },
    });
}

async function handleEventContext(uri: AtUri, did: string, record: Record<string, unknown>, now: Date) {
  const event = record.event as { uri: string };
  const scene = record.scene as { uri: string };

  // AUTHORIZATION: only a builder+ of the scene may curate an event onto it.
  // The signing DID (did) is the curator; verify their role before indexing.
  if (!(await canCurate(scene.uri, did))) {
    console.warn(
      `Rejected unauthorized eventContext ${uri.toString()} from ${did} for scene ${scene.uri}`,
    );
    return;
  }

  await db
    .insert(eventContexts)
    .values({
      uri: uri.toString(),
      authorDid: did,
      eventUri: event.uri,
      sceneUri: scene.uri,
      curatedByDid: record.curatedBy as string | undefined,
      visibility: (record.visibility as string) || "public",
      pinned: (record.pinned as boolean) || false,
      createdAt: new Date(record.createdAt as string),
      indexedAt: now,
    })
    .onConflictDoUpdate({
      target: eventContexts.uri,
      set: {
        visibility: (record.visibility as string) || "public",
        pinned: (record.pinned as boolean) || false,
        indexedAt: now,
      },
    });
}

async function handleDelete(uri: AtUri) {
  const uriStr = uri.toString();
  const collection = uri.collection;

  switch (collection) {
    case "community.lexicon.calendar.event":
      await db.delete(events).where(eq(events.uri, uriStr));
      break;
    case "community.lexicon.calendar.rsvp":
      await db.delete(rsvps).where(eq(rsvps.uri, uriStr));
      break;
    case "social.scenius.scene":
      await db.delete(scenes).where(eq(scenes.uri, uriStr));
      break;
    case "social.scenius.membership": {
      const [m] = await db
        .select({ sceneUri: memberships.sceneUri })
        .from(memberships)
        .where(eq(memberships.uri, uriStr))
        .limit(1);
      await db.delete(memberships).where(eq(memberships.uri, uriStr));
      if (m) await recomputeMemberCount(m.sceneUri);
      break;
    }
    case "social.scenius.attestation":
      await db.delete(attestations).where(eq(attestations.uri, uriStr));
      break;
    case "social.scenius.eventContext":
      await db.delete(eventContexts).where(eq(eventContexts.uri, uriStr));
      break;
  }
}
