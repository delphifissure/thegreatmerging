CREATE TABLE "caregiver_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"answer_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "caregiver_answers" ADD CONSTRAINT "caregiver_answers_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caregiver_answers" ADD CONSTRAINT "caregiver_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "caregiver_answers_unique" ON "caregiver_answers" USING btree ("couple_id","user_id","question_id");--> statement-breakpoint
alter table caregiver_answers enable row level security;
--> statement-breakpoint
create policy caregiver_answers_owner on caregiver_answers for all using (user_id = auth.uid()) with check (user_id = auth.uid() and app.is_member(couple_id));
--> statement-breakpoint
create policy caregiver_answers_partners_select on caregiver_answers for select using (app.is_partner(couple_id));
