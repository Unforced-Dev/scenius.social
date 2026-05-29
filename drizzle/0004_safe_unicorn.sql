CREATE TABLE "acceptances" (
	"event_uri" text NOT NULL,
	"attendee_did" text NOT NULL,
	"rsvp_uri" text NOT NULL,
	"state" text NOT NULL,
	"position" integer,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uri" text,
	CONSTRAINT "acceptances_event_uri_attendee_did_pk" PRIMARY KEY("event_uri","attendee_did")
);
--> statement-breakpoint
CREATE TABLE "event_inventory" (
	"event_uri" text PRIMARY KEY NOT NULL,
	"capacity" integer,
	"approval_required" boolean DEFAULT false NOT NULL,
	"waitlist_enabled" boolean DEFAULT true NOT NULL,
	"confirmed_count" integer DEFAULT 0 NOT NULL,
	"waitlist_seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "acceptances_event_state_idx" ON "acceptances" USING btree ("event_uri","state");--> statement-breakpoint
CREATE INDEX "acceptances_attendee_idx" ON "acceptances" USING btree ("attendee_did");