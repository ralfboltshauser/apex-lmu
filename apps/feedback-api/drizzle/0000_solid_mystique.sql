CREATE TYPE "public"."feedback_actor" AS ENUM('human', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."feedback_attachment_kind" AS ENUM('selected-area', 'full-window');--> statement-breakpoint
CREATE TYPE "public"."feedback_message_kind" AS ENUM('comment', 'question', 'answer', 'status', 'resolution');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('new', 'acknowledged', 'investigating', 'needs_user_answer', 'user_answered', 'in_progress', 'resolved', 'dismissed', 'duplicate', 'reopened');--> statement-breakpoint
CREATE TABLE "feedback_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"feedback_id" uuid NOT NULL,
	"kind" "feedback_attachment_kind" NOT NULL,
	"media_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"installation_id" uuid NOT NULL,
	"feedback_id" uuid NOT NULL,
	"actor" "feedback_actor" NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_number" bigserial NOT NULL,
	"installation_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"status" "feedback_status" DEFAULT 'new' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"view" text NOT NULL,
	"app_version" text NOT NULL,
	"language" text NOT NULL,
	"platform" text NOT NULL,
	"context" jsonb NOT NULL,
	"resolution_summary" text,
	"duplicate_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feedback_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"feedback_id" uuid NOT NULL,
	"client_message_id" uuid NOT NULL,
	"actor" "feedback_actor" NOT NULL,
	"kind" "feedback_message_kind" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_quotas" (
	"installation_id" uuid PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"feedback_count" integer DEFAULT 0 NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"attachment_bytes" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_installations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"credential_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	"last_app_version" text,
	"last_platform" text
);
--> statement-breakpoint
ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_feedback_id_feedback_items_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_installation_id_feedback_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."feedback_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_feedback_id_feedback_items_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_installation_id_feedback_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."feedback_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_messages" ADD CONSTRAINT "feedback_messages_feedback_id_feedback_items_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_quotas" ADD CONSTRAINT "feedback_quotas_installation_id_feedback_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."feedback_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_attachments_feedback_idx" ON "feedback_attachments" USING btree ("feedback_id");--> statement-breakpoint
CREATE INDEX "feedback_events_installation_cursor_idx" ON "feedback_events" USING btree ("installation_id","id");--> statement-breakpoint
CREATE INDEX "feedback_events_feedback_cursor_idx" ON "feedback_events" USING btree ("feedback_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_items_installation_request_unique" ON "feedback_items" USING btree ("installation_id","client_request_id");--> statement-breakpoint
CREATE INDEX "feedback_items_status_updated_idx" ON "feedback_items" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "feedback_items_installation_updated_idx" ON "feedback_items" USING btree ("installation_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_messages_feedback_client_unique" ON "feedback_messages" USING btree ("feedback_id","client_message_id");--> statement-breakpoint
CREATE INDEX "feedback_messages_feedback_created_idx" ON "feedback_messages" USING btree ("feedback_id","created_at");