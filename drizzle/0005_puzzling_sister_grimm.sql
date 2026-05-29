CREATE TABLE "contact_channels" (
	"did" text PRIMARY KEY NOT NULL,
	"email" text,
	"verified" boolean DEFAULT false NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"recipient_did" text NOT NULL,
	"event_uri" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"leased_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "tzid" text;--> statement-breakpoint
CREATE INDEX "notif_due_idx" ON "notification_jobs" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "notif_event_idx" ON "notification_jobs" USING btree ("event_uri");