CREATE TYPE "public"."color_session_status" AS ENUM('open', 'complete');--> statement-breakpoint
CREATE TYPE "public"."color_step" AS ENUM('specifics', 'preference', 'tag', 'polarization', 'perception_gap', 'context', 'consistency', 'probe', 'complete');--> statement-breakpoint
CREATE TYPE "public"."couple_status" AS ENUM('invited', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('md', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."export_kind" AS ENUM('brief', 'plan', 'profile');--> statement-breakpoint
CREATE TYPE "public"."llm_role" AS ENUM('interpreter', 'summarizer', 'prober', 'concreteness', 'guardrail', 'sentiment_flagger');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('partner_a', 'partner_b', 'caregiver', 'child_proxy');--> statement-breakpoint
CREATE TYPE "public"."plan_item_status" AS ENUM('active', 'parked', 'closed');--> statement-breakpoint
CREATE TYPE "public"."revisit_outcome" AS ENUM('still_true', 'changed', 'removed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('pending', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tag_kind" AS ENUM('requirement', 'preference');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('partner', 'caregiver', 'child_proxy', 'clinician', 'researcher');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_kind" text DEFAULT 'user' NOT NULL,
	"action" text NOT NULL,
	"target_user_id" uuid,
	"target_table" text,
	"target_id" text,
	"consent_state_at_time" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL,
	"run_id" uuid,
	"domain" text NOT NULL,
	"content" jsonb NOT NULL,
	"interpreter_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"caregiver_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "child_conversation_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL,
	"recorded_by" uuid NOT NULL,
	"question_id" text NOT NULL,
	"answer_text" text,
	"pinned_to_plan" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clinician_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinician_user_id" uuid NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"couple_id" uuid,
	"consent_granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "color_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"step" "color_step" NOT NULL,
	"item_ref" text,
	"question_id" text NOT NULL,
	"question_text" text NOT NULL,
	"answer_text" text,
	"skipped" boolean DEFAULT false NOT NULL,
	"shareable_verbatim" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "color_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"run_id" uuid,
	"domain" text NOT NULL,
	"status" "color_session_status" DEFAULT 'open' NOT NULL,
	"state" jsonb NOT NULL,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "consent_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_settings" (
	"user_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"share_relationship_scores" boolean DEFAULT true NOT NULL,
	"share_mental_health_scores" boolean DEFAULT false NOT NULL,
	"share_written_answers_verbatim" boolean DEFAULT false NOT NULL,
	"allow_interpreter_to_quote_prior_answers" boolean DEFAULT true NOT NULL,
	"share_profile_with_therapist" boolean DEFAULT false NOT NULL,
	"therapist_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "consent_settings_user_id_couple_id_pk" PRIMARY KEY("user_id","couple_id")
);
--> statement-breakpoint
CREATE TABLE "couple_members" (
	"couple_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "couple_members_couple_id_user_id_pk" PRIMARY KEY("couple_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "couple_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"couple_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"value" real NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unvalidated" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "couples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_a_id" uuid NOT NULL,
	"partner_b_id" uuid,
	"status" "couple_status" DEFAULT 'invited' NOT NULL,
	"has_children" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid,
	"user_id" uuid,
	"kind" "export_kind" NOT NULL,
	"format" "export_format" NOT NULL,
	"storage_path" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"couple_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"rule_key" text NOT NULL,
	"label" text,
	"triggered_by" jsonb NOT NULL,
	"weight" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "instrument_completions" (
	"user_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"instrument_key" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instrument_completions_user_id_couple_id_instrument_key_pk" PRIMARY KEY("user_id","couple_id","instrument_key")
);
--> statement-breakpoint
CREATE TABLE "instrument_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"source_citation" text NOT NULL,
	"license_note" text NOT NULL,
	"layer" integer NOT NULL,
	"unvalidated" boolean DEFAULT false NOT NULL,
	"items" jsonb NOT NULL,
	"scoring_spec" jsonb NOT NULL,
	"cutoffs" jsonb NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "instrument_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "interpretation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"input_hash" text NOT NULL,
	"rules_version" text NOT NULL,
	"interpreter_version" text,
	"distress_context" boolean,
	"error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "interpretations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"interpreter_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" DEFAULT 'partner_b' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid,
	"user_id" uuid,
	"role" "llm_role" NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"job_step" text,
	"batch_id" text,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_creation_tokens" integer DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"outcome" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_memo" (
	"role" "llm_role" NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"output" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_memo_role_prompt_version_input_hash_pk" PRIMARY KEY("role","prompt_version","input_hash")
);
--> statement-breakpoint
CREATE TABLE "outcome_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_key" text NOT NULL,
	"months_since_baseline" integer NOT NULL,
	"still_together" boolean,
	"satisfaction" integer,
	"sought_therapy" boolean,
	"retake_scores" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parenting_lines" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "polarization_responses" (
	"user_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"self_alone" integer NOT NULL,
	"self_with_partner" integer NOT NULL,
	"partner_becomes" integer NOT NULL,
	"attribution_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "polarization_responses_user_id_couple_id_dimension_pk" PRIMARY KEY("user_id","couple_id","dimension")
);
--> statement-breakpoint
CREATE TABLE "private_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"couple_id" uuid,
	"content" jsonb,
	"generated_at" timestamp with time zone,
	"shared_with" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"safety_note" text,
	"safety_note_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "research_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"researcher_user_id" uuid NOT NULL,
	"agreement_reference" text NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"instrument_key" text NOT NULL,
	"item_id" text NOT NULL,
	"pass" text DEFAULT 'single' NOT NULL,
	"value" integer,
	"value_enc" "bytea",
	"needs_context" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "responses_value_xor_enc" CHECK (("responses"."value" is null) <> ("responses"."value_enc" is null))
);
--> statement-breakpoint
CREATE TABLE "revisits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"item_index" integer NOT NULL,
	"due_date" date NOT NULL,
	"outcome" "revisit_outcome",
	"notes" text,
	"completed_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"user_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"instrument_key" text NOT NULL,
	"subscale" text NOT NULL,
	"value" real,
	"value_enc" "bytea",
	"cutoff_label" text,
	"unvalidated" boolean DEFAULT false NOT NULL,
	"scoring_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "scores_value_xor_enc" CHECK (("scores"."value" is null) <> ("scores"."value_enc" is null))
);
--> statement-breakpoint
CREATE TABLE "sentiment_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source_answer_id" uuid,
	"marker" text NOT NULL,
	"quoted_span" text NOT NULL,
	"confidence" real NOT NULL,
	"flagger_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "square_one_notes" (
	"user_id" uuid NOT NULL,
	"question_index" integer NOT NULL,
	"notes" text,
	"raised_eyebrow" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "square_one_notes_user_id_question_index_pk" PRIMARY KEY("user_id","question_index")
);
--> statement-breakpoint
CREATE TABLE "square_one_requirements" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"item_ref" text NOT NULL,
	"tag" "tag_kind" NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tags_comment_nonempty" CHECK (length(trim("tags"."comment")) > 0)
);
--> statement-breakpoint
CREATE TABLE "therapist_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"couple_id" uuid,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"include_brief" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "therapist_shares_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"auth_provider_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" DEFAULT 'partner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_auth_provider_id_unique" UNIQUE("auth_provider_id")
);
--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_run_id_interpretation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."interpretation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_conversation_answers" ADD CONSTRAINT "child_conversation_answers_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_conversation_answers" ADD CONSTRAINT "child_conversation_answers_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinician_links" ADD CONSTRAINT "clinician_links_clinician_user_id_users_id_fk" FOREIGN KEY ("clinician_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinician_links" ADD CONSTRAINT "clinician_links_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinician_links" ADD CONSTRAINT "clinician_links_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "color_answers" ADD CONSTRAINT "color_answers_session_id_color_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."color_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "color_answers" ADD CONSTRAINT "color_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "color_answers" ADD CONSTRAINT "color_answers_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "color_sessions" ADD CONSTRAINT "color_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "color_sessions" ADD CONSTRAINT "color_sessions_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "color_sessions" ADD CONSTRAINT "color_sessions_run_id_interpretation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."interpretation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_changes" ADD CONSTRAINT "consent_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_changes" ADD CONSTRAINT "consent_changes_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_settings" ADD CONSTRAINT "consent_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_settings" ADD CONSTRAINT "consent_settings_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couple_members" ADD CONSTRAINT "couple_members_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couple_members" ADD CONSTRAINT "couple_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couple_scores" ADD CONSTRAINT "couple_scores_run_id_interpretation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."interpretation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couple_scores" ADD CONSTRAINT "couple_scores_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couples" ADD CONSTRAINT "couples_partner_a_id_users_id_fk" FOREIGN KEY ("partner_a_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couples" ADD CONSTRAINT "couples_partner_b_id_users_id_fk" FOREIGN KEY ("partner_b_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_run_id_interpretation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."interpretation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrument_completions" ADD CONSTRAINT "instrument_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrument_completions" ADD CONSTRAINT "instrument_completions_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpretation_runs" ADD CONSTRAINT "interpretation_runs_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_run_id_interpretation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."interpretation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polarization_responses" ADD CONSTRAINT "polarization_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polarization_responses" ADD CONSTRAINT "polarization_responses_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_results" ADD CONSTRAINT "private_results_run_id_interpretation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."interpretation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_results" ADD CONSTRAINT "private_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_results" ADD CONSTRAINT "private_results_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_agreements" ADD CONSTRAINT "research_agreements_researcher_user_id_users_id_fk" FOREIGN KEY ("researcher_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisits" ADD CONSTRAINT "revisits_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisits" ADD CONSTRAINT "revisits_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_run_id_interpretation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."interpretation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentiment_flags" ADD CONSTRAINT "sentiment_flags_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentiment_flags" ADD CONSTRAINT "sentiment_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentiment_flags" ADD CONSTRAINT "sentiment_flags_source_answer_id_color_answers_id_fk" FOREIGN KEY ("source_answer_id") REFERENCES "public"."color_answers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "square_one_notes" ADD CONSTRAINT "square_one_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "square_one_requirements" ADD CONSTRAINT "square_one_requirements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapist_shares" ADD CONSTRAINT "therapist_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapist_shares" ADD CONSTRAINT "therapist_shares_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_target_user_idx" ON "audit_log" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "briefs_couple_idx" ON "briefs" USING btree ("couple_id");--> statement-breakpoint
CREATE INDEX "child_answers_couple_idx" ON "child_conversation_answers" USING btree ("couple_id");--> statement-breakpoint
CREATE INDEX "clinician_links_subject_idx" ON "clinician_links" USING btree ("subject_user_id");--> statement-breakpoint
CREATE INDEX "color_answers_session_idx" ON "color_answers" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "color_sessions_user_couple_domain" ON "color_sessions" USING btree ("user_id","couple_id","domain");--> statement-breakpoint
CREATE INDEX "couple_scores_couple_idx" ON "couple_scores" USING btree ("couple_id");--> statement-breakpoint
CREATE INDEX "couples_partner_a_idx" ON "couples" USING btree ("partner_a_id");--> statement-breakpoint
CREATE INDEX "couples_partner_b_idx" ON "couples" USING btree ("partner_b_id");--> statement-breakpoint
CREATE INDEX "flags_couple_idx" ON "flags" USING btree ("couple_id");--> statement-breakpoint
CREATE INDEX "interpretation_runs_couple_idx" ON "interpretation_runs" USING btree ("couple_id");--> statement-breakpoint
CREATE INDEX "invitations_couple_idx" ON "invitations" USING btree ("couple_id");--> statement-breakpoint
CREATE INDEX "llm_calls_couple_idx" ON "llm_calls" USING btree ("couple_id");--> statement-breakpoint
CREATE INDEX "outcome_reports_cohort_idx" ON "outcome_reports" USING btree ("cohort_key");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_couple_version" ON "plans" USING btree ("couple_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "private_results_run_user" ON "private_results" USING btree ("run_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "responses_unique_item" ON "responses" USING btree ("user_id","couple_id","instrument_key","item_id","pass");--> statement-breakpoint
CREATE INDEX "responses_user_couple_idx" ON "responses" USING btree ("user_id","couple_id");--> statement-breakpoint
CREATE INDEX "revisits_plan_idx" ON "revisits" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "scores_user_couple_idx" ON "scores" USING btree ("user_id","couple_id");--> statement-breakpoint
CREATE INDEX "sentiment_flags_couple_idx" ON "sentiment_flags" USING btree ("couple_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_couple_item" ON "tags" USING btree ("user_id","couple_id","item_ref");--> statement-breakpoint
CREATE INDEX "therapist_shares_user_idx" ON "therapist_shares" USING btree ("user_id");