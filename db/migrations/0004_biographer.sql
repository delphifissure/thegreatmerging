CREATE TYPE "public"."conversation_kind" AS ENUM('biographer', 'mentor');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('history', 'constitution');--> statement-breakpoint
CREATE TYPE "public"."entry_mark" AS ENUM('settled', 'open');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('proposed', 'ratified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."entry_tier" AS ENUM('private', 'avatar_only', 'shareable');--> statement-breakpoint
CREATE TYPE "public"."turn_rating" AS ENUM('like_me', 'not_like_me');--> statement-breakpoint
CREATE TYPE "public"."turn_role" AS ENUM('guide', 'person', 'avatar');--> statement-breakpoint
ALTER TYPE "public"."llm_role" ADD VALUE 'biographer';--> statement-breakpoint
ALTER TYPE "public"."llm_role" ADD VALUE 'drafter';--> statement-breakpoint
ALTER TYPE "public"."llm_role" ADD VALUE 'mentor';--> statement-breakpoint
CREATE TABLE "conversation_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "conversation_kind" NOT NULL,
	"focus" text,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"drafted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversation_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" "turn_role" NOT NULL,
	"content_enc" "bytea" NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note_enc" "bytea",
	"rating" "turn_rating",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document" "document_kind" NOT NULL,
	"section" text NOT NULL,
	"text_enc" "bytea" NOT NULL,
	"status" "entry_status" DEFAULT 'proposed' NOT NULL,
	"mark" "entry_mark" DEFAULT 'open' NOT NULL,
	"tier" "entry_tier" DEFAULT 'private' NOT NULL,
	"source_thread_id" uuid,
	"source_turns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"in_their_words" boolean DEFAULT false NOT NULL,
	"ratified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_thread_id_conversation_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."conversation_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_entries" ADD CONSTRAINT "document_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_entries" ADD CONSTRAINT "document_entries_source_thread_id_conversation_threads_id_fk" FOREIGN KEY ("source_thread_id") REFERENCES "public"."conversation_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_threads_user_idx" ON "conversation_threads" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_turns_thread_seq" ON "conversation_turns" USING btree ("thread_id","seq");--> statement-breakpoint
CREATE INDEX "document_entries_user_idx" ON "document_entries" USING btree ("user_id","document","status");--> statement-breakpoint
-- Intervention prototype: conversations and personal documents are private to their owner. No partner, clinician or researcher policy exists on purpose.
alter table conversation_threads enable row level security;
--> statement-breakpoint
create policy conversation_threads_owner on conversation_threads for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
alter table conversation_turns enable row level security;
--> statement-breakpoint
create policy conversation_turns_owner on conversation_turns for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
alter table document_entries enable row level security;
--> statement-breakpoint
create policy document_entries_owner on document_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
