CREATE TABLE "accounts" (
	"did" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestations" (
	"uri" text PRIMARY KEY NOT NULL,
	"author_did" text NOT NULL,
	"scene_uri" text NOT NULL,
	"subject_did" text NOT NULL,
	"statement" text,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_contexts" (
	"uri" text PRIMARY KEY NOT NULL,
	"author_did" text NOT NULL,
	"event_uri" text NOT NULL,
	"scene_uri" text NOT NULL,
	"curated_by_did" text,
	"visibility" text DEFAULT 'public' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"uri" text PRIMARY KEY NOT NULL,
	"author_did" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"mode" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"location_name" text,
	"location_lat" text,
	"location_lon" text,
	"location_locality" text,
	"location_address" text,
	"virtual_uri" text,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"uri" text PRIMARY KEY NOT NULL,
	"author_did" text NOT NULL,
	"scene_uri" text NOT NULL,
	"member_did" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rsvps" (
	"uri" text PRIMARY KEY NOT NULL,
	"author_did" text NOT NULL,
	"event_uri" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"uri" text PRIMARY KEY NOT NULL,
	"author_did" text NOT NULL,
	"name" text NOT NULL,
	"handle" text,
	"description" text,
	"type" text,
	"visibility" text DEFAULT 'public' NOT NULL,
	"member_policy" text DEFAULT 'attestation' NOT NULL,
	"location_name" text,
	"location_lat" text,
	"location_lon" text,
	"location_locality" text,
	"location_region" text,
	"location_country" text,
	"tags" text[],
	"member_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "attestations_scene_idx" ON "attestations" USING btree ("scene_uri");--> statement-breakpoint
CREATE INDEX "attestations_subject_idx" ON "attestations" USING btree ("subject_did");--> statement-breakpoint
CREATE UNIQUE INDEX "attestations_author_subject_scene_idx" ON "attestations" USING btree ("author_did","subject_did","scene_uri");--> statement-breakpoint
CREATE INDEX "event_contexts_scene_idx" ON "event_contexts" USING btree ("scene_uri");--> statement-breakpoint
CREATE INDEX "event_contexts_event_idx" ON "event_contexts" USING btree ("event_uri");--> statement-breakpoint
CREATE UNIQUE INDEX "event_contexts_event_scene_idx" ON "event_contexts" USING btree ("event_uri","scene_uri");--> statement-breakpoint
CREATE INDEX "events_author_idx" ON "events" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "events_starts_at_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_locality_idx" ON "events" USING btree ("location_locality");--> statement-breakpoint
CREATE INDEX "memberships_scene_idx" ON "memberships" USING btree ("scene_uri");--> statement-breakpoint
CREATE INDEX "memberships_member_idx" ON "memberships" USING btree ("member_did");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_scene_member_idx" ON "memberships" USING btree ("scene_uri","member_did");--> statement-breakpoint
CREATE INDEX "rsvps_event_idx" ON "rsvps" USING btree ("event_uri");--> statement-breakpoint
CREATE INDEX "rsvps_author_idx" ON "rsvps" USING btree ("author_did");--> statement-breakpoint
CREATE UNIQUE INDEX "rsvps_author_event_idx" ON "rsvps" USING btree ("author_did","event_uri");--> statement-breakpoint
CREATE INDEX "scenes_author_idx" ON "scenes" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "scenes_visibility_idx" ON "scenes" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "scenes_locality_idx" ON "scenes" USING btree ("location_locality");