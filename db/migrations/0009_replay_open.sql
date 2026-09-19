DROP INDEX "replay_turns_replay_seq";--> statement-breakpoint
ALTER TABLE "replay_turn_words" ADD COLUMN "coach_note_enc" "bytea";--> statement-breakpoint
ALTER TABLE "replay_turns" ADD COLUMN "take" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "replays" ADD COLUMN "proposer_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "replays" ADD COLUMN "partner_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "replays" ADD COLUMN "take" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "replay_turns_replay_take_seq" ON "replay_turns" USING btree ("replay_id","take","seq");--> statement-breakpoint
-- Watching together: while BOTH participants have opened their avatar's words, each may read the other's. Either closing theirs closes it for both.
create policy replay_turn_words_open on replay_turn_words for select using (
  exists (
    select 1 from replay_turns t join replays r on r.id = t.replay_id
    where t.id = turn_id and r.proposer_open and r.partner_open and (r.proposer_id = auth.uid() or r.partner_id = auth.uid())
  )
);
