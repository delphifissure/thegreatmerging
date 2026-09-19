CREATE TYPE "public"."content_rating" AS ENUM('would_say', 'would_not_say');--> statement-breakpoint
CREATE TYPE "public"."voice_register" AS ENUM('everyday', 'heated', 'long_form', 'spoken');--> statement-breakpoint
CREATE TABLE "voice_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"register" "voice_register" NOT NULL,
	"text_enc" "bytea" NOT NULL,
	"words" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD COLUMN "content_rating" "content_rating";--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD COLUMN "correction_enc" "bytea";--> statement-breakpoint
ALTER TABLE "voice_samples" ADD CONSTRAINT "voice_samples_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_samples_user_idx" ON "voice_samples" USING btree ("user_id","register");--> statement-breakpoint
-- Writing samples are private to their owner. No partner, clinician or researcher policy exists on purpose.
alter table voice_samples enable row level security;
--> statement-breakpoint
create policy voice_samples_owner on voice_samples for all using (user_id = auth.uid()) with check (user_id = auth.uid());
