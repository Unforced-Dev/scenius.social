import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

// --- Provenance (on every record-derived table) ---
// Makes indexing idempotent + commutative regardless of delivery order:
//   - cid/rev   : content-addressed reconciliation; rev orders firehose writes
//   - source    : 'optimistic' (our write, awaiting firehose) | 'firehose' (canonical)
//   - pendingSince/confirmedAt : an optimistic row is a *verifiable claim*; the
//     orphan sweep promotes (confirmedAt) or rolls back rows past their TTL.
// Reconciliation rule (see lib/scenius/indexer.ts): firehose beats optimistic;
// among firehose writes, higher rev wins; deletes leave a tombstone so a late
// or replayed create cannot resurrect a deleted record.
const recordProvenance = () => ({
  cid: text("cid"),
  rev: text("rev"),
  source: text("source").notNull().default("firehose"),
  pendingSince: timestamp("pending_since", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

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
    governanceMode: text("governance_mode").notNull().default("administered"),
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
    ...recordProvenance(),
  },
  (t) => [
    index("scenes_author_idx").on(t.authorDid),
    index("scenes_visibility_idx").on(t.visibility),
    index("scenes_locality_idx").on(t.locationLocality),
    // v0: globally-unique handles for deterministic /s/[handle] routing.
    // (Revisit when federated duplicate-handle scenes become real — see the
    // deferred design question on scene identity / credible exit.)
    uniqueIndex("scenes_handle_idx").on(t.handle),
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
    ...recordProvenance(),
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
    ...recordProvenance(),
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
    ...recordProvenance(),
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
    ...recordProvenance(),
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
    ...recordProvenance(),
  },
  (t) => [
    index("rsvps_event_idx").on(t.eventUri),
    index("rsvps_author_idx").on(t.authorDid),
    uniqueIndex("rsvps_author_event_idx").on(t.authorDid, t.eventUri),
  ],
);

// --- Event inventory (AppView-authoritative capacity ledger) ---
// The seat decision can't be atomic across N attendee PDSes, so Postgres is the
// serialization point: arbitration locks this row (FOR UPDATE) per event. Fully
// rebuildable from eventConfig + the acceptances ledger.

export const eventInventory = pgTable("event_inventory", {
  eventUri: text("event_uri").primaryKey(),
  capacity: integer("capacity"), // null = unlimited
  approvalRequired: boolean("approval_required").notNull().default(false),
  waitlistEnabled: boolean("waitlist_enabled").notNull().default(true),
  confirmedCount: integer("confirmed_count").notNull().default(0),
  waitlistSeq: integer("waitlist_seq").notNull().default(0), // monotonic, never reused
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Acceptances (the seat ledger — RSVP intent → host/AppView countersignature) ---

export const acceptances = pgTable(
  "acceptances",
  {
    eventUri: text("event_uri").notNull(),
    attendeeDid: text("attendee_did").notNull(),
    rsvpUri: text("rsvp_uri").notNull(),
    state: text("state").notNull(), // confirmed | waitlisted | requested | declined
    position: integer("position"), // waitlist arrival order
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    uri: text("uri"), // future: the minted social.scenius.acceptance record (null in v0)
  },
  (t) => [
    primaryKey({ columns: [t.eventUri, t.attendeeDid] }),
    index("acceptances_event_state_idx").on(t.eventUri, t.state),
    index("acceptances_attendee_idx").on(t.attendeeDid),
  ],
);

// --- Tombstones (deleted records — prevent resurrection by late/replayed creates) ---

export const tombstones = pgTable("tombstones", {
  uri: text("uri").primaryKey(),
  collection: text("collection").notNull(),
  rev: text("rev"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Firehose cursor (single-row watermark for the Tap consumer) ---

export const firehoseCursor = pgTable("firehose_cursor", {
  id: integer("id").primaryKey().default(1),
  cursor: text("cursor"),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
