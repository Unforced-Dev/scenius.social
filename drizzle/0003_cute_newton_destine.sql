CREATE TABLE "firehose_cursor" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"cursor" text,
	"last_event_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tombstones" (
	"uri" text PRIMARY KEY NOT NULL,
	"collection" text NOT NULL,
	"rev" text,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attestations" ADD COLUMN "cid" text;--> statement-breakpoint
ALTER TABLE "attestations" ADD COLUMN "rev" text;--> statement-breakpoint
ALTER TABLE "attestations" ADD COLUMN "source" text DEFAULT 'firehose' NOT NULL;--> statement-breakpoint
ALTER TABLE "attestations" ADD COLUMN "pending_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attestations" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_contexts" ADD COLUMN "cid" text;--> statement-breakpoint
ALTER TABLE "event_contexts" ADD COLUMN "rev" text;--> statement-breakpoint
ALTER TABLE "event_contexts" ADD COLUMN "source" text DEFAULT 'firehose' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_contexts" ADD COLUMN "pending_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_contexts" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cid" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "rev" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "source" text DEFAULT 'firehose' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "pending_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "cid" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "rev" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "source" text DEFAULT 'firehose' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "pending_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "cid" text;--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "rev" text;--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "source" text DEFAULT 'firehose' NOT NULL;--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "pending_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "cid" text;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "rev" text;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "source" text DEFAULT 'firehose' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "pending_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "confirmed_at" timestamp with time zone;