/**
 * Drizzle schema for The Great Merging (built as "The Plan"). Every table carries created_at / updated_at / deleted_at.
 * Row-level security policies live as raw SQL in db/migrations/*_rls.sql next to these tables.
 *
 * `users.id` equals the Supabase auth user id (auth.uid()) so RLS policies can compare
 * `user_id = auth.uid()` directly, as in the build prompt's examples.
 *
 * Mental-health values (PHQ-9, GAD-7, OCI-R responses and scores) are stored only in
 * `*_enc` bytea columns, encrypted in lib/crypto.ts; the plaintext columns stay NULL.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer) {
    return value;
  },
  fromDriver(value: unknown) {
    return Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
  },
});

const timestamps = {
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
};

export const userRoleEnum = pgEnum("user_role", ["partner", "caregiver", "child_proxy", "clinician", "researcher"]);
export const coupleStatusEnum = pgEnum("couple_status", ["invited", "active", "closed"]);
export const memberRoleEnum = pgEnum("member_role", ["partner_a", "partner_b", "caregiver", "child_proxy"]);
export const colorStepEnum = pgEnum("color_step", [
  "specifics",
  "preference",
  "tag",
  "polarization",
  "perception_gap",
  "context",
  "consistency",
  "probe",
  "complete",
]);
export const colorSessionStatusEnum = pgEnum("color_session_status", ["open", "complete"]);
export const tagKindEnum = pgEnum("tag_kind", ["requirement", "preference"]);
export const planItemStatusEnum = pgEnum("plan_item_status", ["active", "parked", "closed"]);
export const revisitOutcomeEnum = pgEnum("revisit_outcome", ["still_true", "changed", "removed"]);
export const llmRoleEnum = pgEnum("llm_role", [
  "interpreter",
  "summarizer",
  "prober",
  "concreteness",
  "guardrail",
  "sentiment_flagger",
  "biographer",
  "drafter",
  "mentor",
  "version",
  "panel_reader",
]);
export const runStatusEnum = pgEnum("run_status", ["pending", "running", "complete", "failed"]);
export const exportKindEnum = pgEnum("export_kind", ["brief", "plan", "profile"]);
export const exportFormatEnum = pgEnum("export_format", ["md", "pdf"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  auth_provider_id: uuid("auth_provider_id").notNull().unique(),
  display_name: text("display_name").notNull(),
  role: userRoleEnum("role").notNull().default("partner"),
  ...timestamps,
});

export const couples = pgTable(
  "couples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partner_a_id: uuid("partner_a_id")
      .notNull()
      .references(() => users.id),
    partner_b_id: uuid("partner_b_id").references(() => users.id),
    status: coupleStatusEnum("status").notNull().default("invited"),
    has_children: boolean("has_children").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("couples_partner_a_idx").on(t.partner_a_id), index("couples_partner_b_idx").on(t.partner_b_id)],
);

/** Third positions (caregiver, child proxy) linked to a couple. Partners are on `couples` itself. */
export const couple_members = pgTable(
  "couple_members",
  {
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: memberRoleEnum("role").notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.couple_id, t.user_id] })],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    invited_by: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    email: text("email").notNull(),
    role: memberRoleEnum("role").notNull().default("partner_b"),
    token_hash: text("token_hash").notNull().unique(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    accepted_at: timestamp("accepted_at", { withTimezone: true }),
    accepted_by: uuid("accepted_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("invitations_couple_idx").on(t.couple_id)],
);

export const consent_settings = pgTable(
  "consent_settings",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    share_relationship_scores: boolean("share_relationship_scores").notNull().default(true),
    share_mental_health_scores: boolean("share_mental_health_scores").notNull().default(false),
    share_written_answers_verbatim: boolean("share_written_answers_verbatim").notNull().default(false),
    allow_interpreter_to_quote_prior_answers: boolean("allow_interpreter_to_quote_prior_answers").notNull().default(true),
    share_profile_with_therapist: boolean("share_profile_with_therapist").notNull().default(false),
    therapist_email: text("therapist_email"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.user_id, t.couple_id] })],
);

/** Every consent change, one row per changed field. Also mirrored into audit_log. */
export const consent_changes = pgTable("consent_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id),
  couple_id: uuid("couple_id")
    .notNull()
    .references(() => couples.id),
  field: text("field").notNull(),
  old_value: jsonb("old_value"),
  new_value: jsonb("new_value"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Record of the instrument definition version used, synced from config/instruments at seed time. */
export const instrument_definitions = pgTable("instrument_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  source_citation: text("source_citation").notNull(),
  license_note: text("license_note").notNull(),
  layer: integer("layer").notNull(),
  unvalidated: boolean("unvalidated").notNull().default(false),
  items: jsonb("items").notNull(),
  scoring_spec: jsonb("scoring_spec").notNull(),
  cutoffs: jsonb("cutoffs").notNull(),
  version: text("version").notNull(),
  ...timestamps,
});

export const responses = pgTable(
  "responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    instrument_key: text("instrument_key").notNull(),
    item_id: text("item_id").notNull(),
    pass: text("pass").notNull().default("single"),
    /** Plaintext value for non-mental-health instruments; NULL for phq9/gad7/oci_r. */
    value: integer("value"),
    /** AES-256-GCM ciphertext for mental-health instruments; NULL otherwise. */
    value_enc: bytea("value_enc"),
    needs_context: boolean("needs_context").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("responses_unique_item").on(t.user_id, t.couple_id, t.instrument_key, t.item_id, t.pass),
    index("responses_user_couple_idx").on(t.user_id, t.couple_id),
    check(
      "responses_value_xor_enc",
      sql`(${t.value} is null) <> (${t.value_enc} is null)`,
    ),
  ],
);

/** Marks an instrument as finished by a user; drives progress bars and the "both done" gate. */
export const instrument_completions = pgTable(
  "instrument_completions",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    instrument_key: text("instrument_key").notNull(),
    completed_at: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.couple_id, t.instrument_key] })],
);

export const interpretation_runs = pgTable(
  "interpretation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    status: runStatusEnum("status").notNull().default("pending"),
    /** sha256 of both partners' complete response sets + rules version; identical inputs never rerun the model. */
    input_hash: text("input_hash").notNull(),
    rules_version: text("rules_version").notNull(),
    interpreter_version: text("interpreter_version"),
    distress_context: boolean("distress_context"),
    error: text("error"),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("interpretation_runs_couple_idx").on(t.couple_id)],
);

export const scores = pgTable(
  "scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    run_id: uuid("run_id").references(() => interpretation_runs.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    instrument_key: text("instrument_key").notNull(),
    subscale: text("subscale").notNull(),
    value: real("value"),
    value_enc: bytea("value_enc"),
    cutoff_label: text("cutoff_label"),
    unvalidated: boolean("unvalidated").notNull().default(false),
    scoring_version: text("scoring_version").notNull(),
    computed_at: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    index("scores_user_couple_idx").on(t.user_id, t.couple_id),
    check("scores_value_xor_enc", sql`(${t.value} is null) <> (${t.value_enc} is null)`),
  ],
);

export const couple_scores = pgTable(
  "couple_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    run_id: uuid("run_id").references(() => interpretation_runs.id),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    details: jsonb("details").notNull().default({}),
    unvalidated: boolean("unvalidated").notNull().default(false),
    computed_at: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("couple_scores_couple_idx").on(t.couple_id)],
);

export const flags = pgTable(
  "flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    run_id: uuid("run_id").references(() => interpretation_runs.id),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    domain: text("domain").notNull(),
    rule_key: text("rule_key").notNull(),
    label: text("label"),
    triggered_by: jsonb("triggered_by").notNull(),
    weight: integer("weight").notNull(),
    ...timestamps,
  },
  (t) => [index("flags_couple_idx").on(t.couple_id)],
);

/** Stage 2 interpreter output for a run: per-domain aligned / low-intensity / flagged lists. */
export const interpretations = pgTable("interpretations", {
  id: uuid("id").primaryKey().defaultRandom(),
  run_id: uuid("run_id")
    .notNull()
    .references(() => interpretation_runs.id),
  couple_id: uuid("couple_id")
    .notNull()
    .references(() => couples.id),
  content: jsonb("content").notNull(),
  interpreter_version: text("interpreter_version").notNull(),
  input_hash: text("input_hash").notNull(),
  ...timestamps,
});

/** Each person's private results: one plain sentence per instrument, shown before any shared screen. */
export const private_results = pgTable(
  "private_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    run_id: uuid("run_id")
      .notNull()
      .references(() => interpretation_runs.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    content: jsonb("content").notNull(),
    viewed_at: timestamp("viewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("private_results_run_user").on(t.run_id, t.user_id)],
);

export const polarization_responses = pgTable(
  "polarization_responses",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    dimension: text("dimension").notNull(),
    self_alone: integer("self_alone").notNull(),
    self_with_partner: integer("self_with_partner").notNull(),
    partner_becomes: integer("partner_becomes").notNull(),
    attribution_text: text("attribution_text"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.user_id, t.couple_id, t.dimension] })],
);

export const color_sessions = pgTable(
  "color_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    run_id: uuid("run_id").references(() => interpretation_runs.id),
    domain: text("domain").notNull(),
    status: colorSessionStatusEnum("status").notNull().default("open"),
    /** Persisted state machine: current state, queue, cursor (lib/color/machine.ts). */
    state: jsonb("state").notNull(),
    /** Every turn: {role, content, step, at}. */
    transcript: jsonb("transcript").notNull().default([]),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("color_sessions_user_couple_domain").on(t.user_id, t.couple_id, t.domain)],
);

export const color_answers = pgTable(
  "color_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    session_id: uuid("session_id")
      .notNull()
      .references(() => color_sessions.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    step: colorStepEnum("step").notNull(),
    item_ref: text("item_ref"),
    question_id: text("question_id").notNull(),
    question_text: text("question_text").notNull(),
    answer_text: text("answer_text"),
    skipped: boolean("skipped").notNull().default(false),
    shareable_verbatim: boolean("shareable_verbatim").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("color_answers_session_idx").on(t.session_id)],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    domain: text("domain").notNull(),
    item_ref: text("item_ref").notNull(),
    tag: tagKindEnum("tag").notNull(),
    comment: text("comment").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tags_user_couple_item").on(t.user_id, t.couple_id, t.item_ref),
    check("tags_comment_nonempty", sql`length(trim(${t.comment})) > 0`),
  ],
);

export const briefs = pgTable(
  "briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    run_id: uuid("run_id").references(() => interpretation_runs.id),
    domain: text("domain").notNull(),
    content: jsonb("content").notNull(),
    interpreter_version: text("interpreter_version").notNull(),
    input_hash: text("input_hash").notNull(),
    /** Parenting brief sections the couple explicitly shares with a linked caregiver. */
    caregiver_visible: boolean("caregiver_visible").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("briefs_couple_idx").on(t.couple_id)],
);

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    version: integer("version").notNull(),
    items: jsonb("items").notNull().default([]),
    /** Parenting domain: the five named lines, required before the domain closes. */
    parenting_lines: jsonb("parenting_lines"),
    created_by: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("plans_couple_version").on(t.couple_id, t.version)],
);

export const revisits = pgTable(
  "revisits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plan_id: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    item_index: integer("item_index").notNull(),
    due_date: date("due_date").notNull(),
    outcome: revisitOutcomeEnum("outcome"),
    notes: text("notes"),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    reminder_sent_at: timestamp("reminder_sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("revisits_plan_idx").on(t.plan_id)],
);

export const profiles = pgTable(
  "profiles",
  {
    user_id: uuid("user_id")
      .primaryKey()
      .references(() => users.id),
    couple_id: uuid("couple_id").references(() => couples.id),
    content: jsonb("content"),
    generated_at: timestamp("generated_at", { withTimezone: true }),
    /** [{email, shared_at, revoked_at}] */
    shared_with: jsonb("shared_with").notNull().default([]),
    /** PHQ-9 item 9 note. Visible only to this user, never to the partner, never in any export. */
    safety_note: text("safety_note"),
    safety_note_at: timestamp("safety_note_at", { withTimezone: true }),
    ...timestamps,
  },
);

export const therapist_shares = pgTable(
  "therapist_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    couple_id: uuid("couple_id").references(() => couples.id),
    email: text("email").notNull(),
    token_hash: text("token_hash").notNull().unique(),
    include_brief: boolean("include_brief").notNull().default(false),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    last_accessed_at: timestamp("last_accessed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("therapist_shares_user_idx").on(t.user_id)],
);

export const audit_log = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor_user_id: uuid("actor_user_id"),
    actor_kind: text("actor_kind").notNull().default("user"),
    action: text("action").notNull(),
    target_user_id: uuid("target_user_id"),
    target_table: text("target_table"),
    target_id: text("target_id"),
    consent_state_at_time: jsonb("consent_state_at_time"),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_target_user_idx").on(t.target_user_id), index("audit_log_actor_idx").on(t.actor_user_id)],
);

export const llm_calls = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couple_id: uuid("couple_id").references(() => couples.id),
    user_id: uuid("user_id").references(() => users.id),
    role: llmRoleEnum("role").notNull(),
    model: text("model").notNull(),
    prompt_version: text("prompt_version").notNull(),
    input_hash: text("input_hash").notNull(),
    job_step: text("job_step"),
    batch_id: text("batch_id"),
    cache_read_tokens: integer("cache_read_tokens").notNull().default(0),
    cache_creation_tokens: integer("cache_creation_tokens").notNull().default(0),
    tokens_in: integer("tokens_in").notNull().default(0),
    tokens_out: integer("tokens_out").notNull().default(0),
    attempt: integer("attempt").notNull().default(1),
    outcome: text("outcome").notNull().default("ok"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("llm_calls_couple_idx").on(t.couple_id)],
);

/** Memoized model outputs keyed by role + prompt version + input hash (cost control 5). */
export const llm_memo = pgTable(
  "llm_memo",
  {
    role: llmRoleEnum("role").notNull(),
    prompt_version: text("prompt_version").notNull(),
    input_hash: text("input_hash").notNull(),
    output: jsonb("output").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.role, t.prompt_version, t.input_hash] })],
);

export const exports = pgTable("exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  couple_id: uuid("couple_id").references(() => couples.id),
  user_id: uuid("user_id").references(() => users.id),
  kind: exportKindEnum("kind").notNull(),
  format: exportFormatEnum("format").notNull(),
  storage_path: text("storage_path").notNull(),
  created_by: uuid("created_by").references(() => users.id),
  ...timestamps,
});

/** Square One mode: single-user private notebook. No scoring, no LLM, no sharing. */
export const square_one_notes = pgTable(
  "square_one_notes",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    question_index: integer("question_index").notNull(),
    notes: text("notes"),
    raised_eyebrow: boolean("raised_eyebrow").notNull().default(false),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.user_id, t.question_index] })],
);

export const square_one_requirements = pgTable("square_one_requirements", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => users.id),
  items: jsonb("items").notNull().default([]),
  ...timestamps,
});

/** Child conversation answers typed by an adult, stored under a child_proxy role. */
export const child_conversation_answers = pgTable(
  "child_conversation_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    recorded_by: uuid("recorded_by")
      .notNull()
      .references(() => users.id),
    question_id: text("question_id").notNull(),
    answer_text: text("answer_text"),
    pinned_to_plan: boolean("pinned_to_plan").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("child_answers_couple_idx").on(t.couple_id)],
);

/** Third-caregiver color answers (section 11): the four caregiver questions, owned by the caregiver. */
export const caregiver_answers = pgTable(
  "caregiver_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    question_id: text("question_id").notNull(),
    answer_text: text("answer_text"),
    ...timestamps,
  },
  (t) => [uniqueIndex("caregiver_answers_unique").on(t.couple_id, t.user_id, t.question_id)],
);

// ---- Clinician and research layer (gated; section 11a) ----

export const clinician_links = pgTable(
  "clinician_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinician_user_id: uuid("clinician_user_id")
      .notNull()
      .references(() => users.id),
    subject_user_id: uuid("subject_user_id")
      .notNull()
      .references(() => users.id),
    couple_id: uuid("couple_id").references(() => couples.id),
    consent_granted_at: timestamp("consent_granted_at", { withTimezone: true }).notNull().defaultNow(),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("clinician_links_subject_idx").on(t.subject_user_id)],
);

export const sentiment_flags = pgTable(
  "sentiment_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couple_id: uuid("couple_id")
      .notNull()
      .references(() => couples.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    source_answer_id: uuid("source_answer_id").references(() => color_answers.id),
    marker: text("marker").notNull(),
    quoted_span: text("quoted_span").notNull(),
    confidence: real("confidence").notNull(),
    flagger_version: text("flagger_version").notNull(),
    ...timestamps,
  },
  (t) => [index("sentiment_flags_couple_idx").on(t.couple_id)],
);

export const outcome_reports = pgTable(
  "outcome_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** De-identified cohort key; the user id is never stored here. */
    cohort_key: text("cohort_key").notNull(),
    months_since_baseline: integer("months_since_baseline").notNull(),
    still_together: boolean("still_together"),
    satisfaction: integer("satisfaction"),
    sought_therapy: boolean("sought_therapy"),
    retake_scores: jsonb("retake_scores"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outcome_reports_cohort_idx").on(t.cohort_key)],
);

export const research_agreements = pgTable("research_agreements", {
  id: uuid("id").primaryKey().defaultRandom(),
  researcher_user_id: uuid("researcher_user_id")
    .notNull()
    .references(() => users.id),
  agreement_reference: text("agreement_reference").notNull(),
  signed_at: timestamp("signed_at", { withTimezone: true }).notNull(),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  ...timestamps,
});


// ---------------------------------------------------------------------------------------------
// Intervention prototype (docs/concept_intervention.md). Everything here is private to its owner.
// Free text is stored only in *_enc columns (lib/crypto.ts encryptText).
// ---------------------------------------------------------------------------------------------
export const conversationKindEnum = pgEnum("conversation_kind", ["biographer", "mentor", "panel"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["open", "closed"]);
export const conversationDepthEnum = pgEnum("conversation_depth", ["light", "deeper"]);
export const turnRoleEnum = pgEnum("turn_role", ["guide", "person", "avatar"]);
/** Whether the avatar got the substance right, asked apart from whether it sounded like the person. */
export const contentRatingEnum = pgEnum("content_rating", ["would_say", "would_not_say"]);
/** Registers a person can paste samples of. What they write to the biographer is the fifth, and is not stored twice. */
export const voiceRegisterEnum = pgEnum("voice_register", ["everyday", "heated", "long_form", "spoken"]);
/** A panel version can also be "me on a bad day", which is neither of the other two. */
export const turnRatingEnum = pgEnum("turn_rating", ["like_me", "not_like_me", "bad_day"]);
export const documentKindEnum = pgEnum("document_kind", ["history", "constitution"]);
export const entryStatusEnum = pgEnum("entry_status", ["proposed", "ratified", "rejected"]);
export const entryMarkEnum = pgEnum("entry_mark", ["settled", "open"]);
export const entryTierEnum = pgEnum("entry_tier", ["private", "avatar_only", "shareable"]);

export const conversation_threads = pgTable(
  "conversation_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: conversationKindEnum("kind").notNull(),
    /** Biographer focus key from config/biographer.json; null for mentor threads. */
    focus: text("focus"),
    status: conversationStatusEnum("status").notNull().default("open"),
    /** Chosen by the person: how far the biographer may go in this conversation. */
    depth: conversationDepthEnum("depth").notNull().default("light"),
    /** Set when the drafter has proposed lines from this thread. */
    drafted_at: timestamp("drafted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("conversation_threads_user_idx").on(t.user_id, t.kind)],
);

export const conversation_turns = pgTable(
  "conversation_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    thread_id: uuid("thread_id")
      .notNull()
      .references(() => conversation_threads.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** Position in the thread, from 1. Turn ids given to the model are "t<seq>". */
    seq: integer("seq").notNull(),
    role: turnRoleEnum("role").notNull(),
    content_enc: bytea("content_enc").notNull(),
    /** Non-sensitive structure only: kind, references, draws_on, unsure. Never text a person wrote. */
    meta: jsonb("meta").notNull().default({}),
    /** Encrypted companions to meta: the "why" of a question, a question for the biographer. */
    note_enc: bytea("note_enc"),
    /** Encrypted JSON: tappable options and the running list of threads. Both echo the person's words. */
    extras_enc: bytea("extras_enc"),
    /** The person's verdict on an avatar reply: the self-recognition test. For the one-notch-ahead self this is about voice. */
    rating: turnRatingEnum("rating"),
    /** Whether they would say that, whatever it sounded like. A good voice makes wrong content persuasive, so the two are asked apart. */
    content_rating: contentRatingEnum("content_rating"),
    /** Encrypted: what the person would have said instead. The pair is a sample of their style with the content held still. */
    correction_enc: bytea("correction_enc"),
    ...timestamps,
  },
  (t) => [uniqueIndex("conversation_turns_thread_seq").on(t.thread_id, t.seq)],
);

/**
 * Things a person wrote or said before the app, pasted in so their avatars can pick up how they
 * write. Only their own side of a conversation is ever stored. Private to the owner.
 */
export const voice_samples = pgTable(
  "voice_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    register: voiceRegisterEnum("register").notNull(),
    text_enc: bytea("text_enc").notNull(),
    words: integer("words").notNull(),
    ...timestamps,
  },
  (t) => [index("voice_samples_user_idx").on(t.user_id, t.register)],
);

export const document_entries = pgTable(
  "document_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    document: documentKindEnum("document").notNull(),
    section: text("section").notNull(),
    text_enc: bytea("text_enc").notNull(),
    status: entryStatusEnum("status").notNull().default("proposed"),
    /** settled: never varied. open: the owner is willing to see what a different self would do. */
    mark: entryMarkEnum("mark").notNull().default("open"),
    /** private | avatar_only | shareable. Nothing is shareable unless the owner says so. */
    tier: entryTierEnum("tier").notNull().default("private"),
    source_thread_id: uuid("source_thread_id").references(() => conversation_threads.id),
    /** Turn sequence numbers in the source thread that the line rests on. */
    source_turns: jsonb("source_turns").notNull().default([]),
    in_their_words: boolean("in_their_words").notNull().default(false),
    ratified_at: timestamp("ratified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("document_entries_user_idx").on(t.user_id, t.document, t.status)],
);
