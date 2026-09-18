CREATE TYPE "public"."conversation_depth" AS ENUM('light', 'deeper');--> statement-breakpoint
ALTER TABLE "conversation_threads" ADD COLUMN "depth" "conversation_depth" DEFAULT 'light' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD COLUMN "extras_enc" "bytea";