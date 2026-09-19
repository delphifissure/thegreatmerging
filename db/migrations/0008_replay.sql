CREATE TYPE "public"."replay_status" AS ENUM('proposed', 'declined', 'accepted', 'running', 'complete', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."replay_verdict" AS ENUM('yes', 'partly', 'no');--> statement-breakpoint
ALTER TYPE "public"."llm_role" ADD VALUE 'rehearsal';--> statement-breakpoint
ALTER TYPE "public"."llm_role" ADD VALUE 'move_coder';--> statement-breakpoint
CREATE TABLE "replay_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"replay_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"account_enc" "bytea" NOT NULL,
	"verdict" "replay_verdict",
	"turn_ratings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "replay_turn_words" (
	"turn_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"words_enc" "bytea" NOT NULL,
	"draws_on" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replay_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"replay_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"speaker_id" uuid NOT NULL,
	"move" text NOT NULL,
	"secondary_move" text,
	"intent" integer,
	"impact" integer,
	"ends" boolean DEFAULT false NOT NULL,
	"remembered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL,
	"proposer_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"frame_enc" "bytea" NOT NULL,
	"status" "replay_status" DEFAULT 'proposed' NOT NULL,
	"max_turns" integer DEFAULT 12 NOT NULL,
	"responded_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "replay_accounts" ADD CONSTRAINT "replay_accounts_replay_id_replays_id_fk" FOREIGN KEY ("replay_id") REFERENCES "public"."replays"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_accounts" ADD CONSTRAINT "replay_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_turn_words" ADD CONSTRAINT "replay_turn_words_turn_id_replay_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."replay_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_turn_words" ADD CONSTRAINT "replay_turn_words_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_turns" ADD CONSTRAINT "replay_turns_replay_id_replays_id_fk" FOREIGN KEY ("replay_id") REFERENCES "public"."replays"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_turns" ADD CONSTRAINT "replay_turns_speaker_id_users_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_proposer_id_users_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_partner_id_users_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "replay_accounts_replay_user" ON "replay_accounts" USING btree ("replay_id","user_id");--> statement-breakpoint
CREATE INDEX "replay_turn_words_user_idx" ON "replay_turn_words" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "replay_turns_replay_seq" ON "replay_turns" USING btree ("replay_id","seq");--> statement-breakpoint
CREATE INDEX "replays_couple_idx" ON "replays" USING btree ("couple_id");--> statement-breakpoint
-- Replay of a remembered argument. The frame and the coded moves are shared by the two participants and nobody else;
-- a person's account and their avatar's words are theirs alone. No clinician or researcher policy exists on purpose.
alter table replays enable row level security;
--> statement-breakpoint
create policy replays_read on replays for select using (proposer_id = auth.uid() or partner_id = auth.uid());
--> statement-breakpoint
create policy replays_propose on replays for insert with check (proposer_id = auth.uid());
--> statement-breakpoint
create policy replays_respond on replays for update using (proposer_id = auth.uid() or partner_id = auth.uid()) with check (proposer_id = auth.uid() or partner_id = auth.uid());
--> statement-breakpoint
alter table replay_accounts enable row level security;
--> statement-breakpoint
create policy replay_accounts_owner on replay_accounts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
alter table replay_turns enable row level security;
--> statement-breakpoint
create policy replay_turns_participants on replay_turns for select using (exists (select 1 from replays r where r.id = replay_id and (r.proposer_id = auth.uid() or r.partner_id = auth.uid())));
--> statement-breakpoint
alter table replay_turn_words enable row level security;
--> statement-breakpoint
create policy replay_turn_words_owner on replay_turn_words for select using (user_id = auth.uid());
