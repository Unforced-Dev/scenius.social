import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// --- Auth (OAuth state + session storage for @atproto/oauth-client-node) ---

export const authState = pgTable("auth_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const authSession = pgTable("auth_session", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// --- Accounts (identity cache from firehose/Tap) ---

export const accounts = pgTable("accounts", {
  did: text("did").primaryKey(),
  handle: text("handle").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  active: boolean("active").notNull().default(true),
  indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Scenes ---

export const scenes = pgTable(
  "scenes",
  {
    uri: text("uri").primaryKey(),
    authorDid: text("author_did").notNull(),
    name: text("name").notNull(),
    handle: text("handle"),
    description: text("description"),
    type: text("type"),
    visibility: text("visibility").notNull().default("public"),
    memberPolicy: text("member_policy").notNull().default("attestation"),
    locationName: text("location_name"),
    locationLat: text("location_lat"),
    locationLon: text("location_lon"),
    locationLocality: text("location_locality"),
    locationRegion: text("location_region"),
    locationCountry: text("location_country"),
    tags: text("tags").array(),
    memberCount: integer("member_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("scenes_author_idx").on(t.authorDid),
    index("scenes_visibility_idx").on(t.visibility),
    index("scenes_locality_idx").on(t.locationLocality),
  ],
);

// --- Memberships ---

export const memberships = pgTable(
  "memberships",
  {
    uri: text("uri").primaryKey(),
    authorDid: text("author_did").notNull(),
    sceneUri: text("scene_uri").notNull(),
    memberDid: text("member_did").notNull(),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("memberships_scene_idx").on(t.sceneUri),
    index("memberships_member_idx").on(t.memberDid),
    uniqueIndex("memberships_scene_member_idx").on(t.sceneUri, t.memberDid),
  ],
);

// --- Attestations ---

export const attestations = pgTable(
  "attestations",
  {
    uri: text("uri").primaryKey(),
    authorDid: text("author_did").notNull(),
    sceneUri: text("scene_uri").notNull(),
    subjectDid: text("subject_did").notNull(),
    statement: text("statement"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attestations_scene_idx").on(t.sceneUri),
    index("attestations_subject_idx").on(t.subjectDid),
    uniqueIndex("attestations_author_subject_scene_idx").on(
      t.authorDid,
      t.subjectDid,
      t.sceneUri,
    ),
  ],
);

// --- Events (indexed from community.lexicon.calendar.event via firehose) ---

export const events = pgTable(
  "events",
  {
    uri: text("uri").primaryKey(),
    authorDid: text("author_did").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    mode: text("mode"),
    status: text("status").notNull().default("scheduled"),
    locationName: text("location_name"),
    locationLat: text("location_lat"),
    locationLon: text("location_lon"),
    locationLocality: text("location_locality"),
    locationAddress: text("location_address"),
    virtualUri: text("virtual_uri"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_author_idx").on(t.authorDid),
    index("events_starts_at_idx").on(t.startsAt),
    index("events_status_idx").on(t.status),
    index("events_locality_idx").on(t.locationLocality),
  ],
);

// --- Event Context (links events to scenes — the curation record) ---

export const eventContexts = pgTable(
  "event_contexts",
  {
    uri: text("uri").primaryKey(),
    authorDid: text("author_did").notNull(),
    eventUri: text("event_uri").notNull(),
    sceneUri: text("scene_uri").notNull(),
    curatedByDid: text("curated_by_did"),
    visibility: text("visibility").notNull().default("public"),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("event_contexts_scene_idx").on(t.sceneUri),
    index("event_contexts_event_idx").on(t.eventUri),
    uniqueIndex("event_contexts_event_scene_idx").on(t.eventUri, t.sceneUri),
  ],
);

// --- RSVPs (indexed from community.lexicon.calendar.rsvp via firehose) ---

export const rsvps = pgTable(
  "rsvps",
  {
    uri: text("uri").primaryKey(),
    authorDid: text("author_did").notNull(),
    eventUri: text("event_uri").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rsvps_event_idx").on(t.eventUri),
    index("rsvps_author_idx").on(t.authorDid),
    uniqueIndex("rsvps_author_event_idx").on(t.authorDid, t.eventUri),
  ],
);
