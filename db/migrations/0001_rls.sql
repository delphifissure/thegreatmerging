-- Row-level security for every table (build prompt section 2a, 3).
-- RLS is the authorization layer. Policies compare against auth.uid(); users.id equals the auth user id.
-- Server-side code running as the service role bypasses RLS by design and must go through lib/data,
-- which writes an audit_log row for every cross-user read.

-- auth.uid() shim so the migrations also run on plain Postgres (integration tests).
-- Supabase already defines auth.uid(); this block is a no-op there.
do $do$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $fn$
      create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid'
    $fn$;
  end if;
end
$do$;
--> statement-breakpoint
create schema if not exists app;
--> statement-breakpoint
create or replace function app.is_partner(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from couples
    where id = c and deleted_at is null
      and (partner_a_id = auth.uid() or partner_b_id = auth.uid())
  )
$$;
--> statement-breakpoint
create or replace function app.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_partner(c) or exists (
    select 1 from couple_members m
    where m.couple_id = c and m.user_id = auth.uid() and m.deleted_at is null
  )
$$;
--> statement-breakpoint
create or replace function app.is_caregiver(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from couple_members m
    where m.couple_id = c and m.user_id = auth.uid() and m.role = 'caregiver' and m.deleted_at is null
  )
$$;
--> statement-breakpoint
create or replace function app.consents(owner uuid, c uuid, field text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case field
      when 'relationship' then cs.share_relationship_scores
      when 'mental_health' then cs.share_mental_health_scores
      when 'verbatim' then cs.share_written_answers_verbatim
      when 'therapist' then cs.share_profile_with_therapist
      else false
    end
    from consent_settings cs
    where cs.user_id = owner and cs.couple_id = c and cs.deleted_at is null
  ), false)
$$;
--> statement-breakpoint
create or replace function app.both_partners_consent(c uuid, field text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select cp.partner_b_id is not null
      and app.consents(cp.partner_a_id, c, field)
      and app.consents(cp.partner_b_id, c, field)
    from couples cp where cp.id = c and cp.deleted_at is null
  ), false)
$$;
--> statement-breakpoint
create or replace function app.has_clinician_link(subject uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clinician_links l
    where l.clinician_user_id = auth.uid() and l.subject_user_id = subject
      and l.revoked_at is null and l.deleted_at is null
  )
$$;
--> statement-breakpoint
create or replace function app.is_researcher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from research_agreements r
    where r.researcher_user_id = auth.uid() and r.revoked_at is null and r.deleted_at is null
  )
$$;
--> statement-breakpoint
create or replace function app.brief_exists(c uuid, d text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from briefs b where b.couple_id = c and b.domain = d and b.deleted_at is null)
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------- users
alter table users enable row level security;
--> statement-breakpoint
create policy users_self on users for all using (id = auth.uid()) with check (id = auth.uid());
--> statement-breakpoint
create policy users_couple_peer on users for select using (
  exists (
    select 1 from couples c
    where c.deleted_at is null
      and (c.partner_a_id = auth.uid() or c.partner_b_id = auth.uid())
      and (c.partner_a_id = users.id or c.partner_b_id = users.id)
  )
  or exists (
    select 1 from couple_members m
    where m.user_id = users.id and m.deleted_at is null and app.is_partner(m.couple_id)
  )
);
--> statement-breakpoint

-- ---------------------------------------------------------------- couples
alter table couples enable row level security;
--> statement-breakpoint
create policy couples_member_select on couples for select using (app.is_member(id));
--> statement-breakpoint
create policy couples_creator_insert on couples for insert with check (partner_a_id = auth.uid());
--> statement-breakpoint
create policy couples_partner_update on couples for update using (app.is_partner(id)) with check (app.is_partner(id));
--> statement-breakpoint

-- ---------------------------------------------------------------- couple_members
alter table couple_members enable row level security;
--> statement-breakpoint
create policy couple_members_select on couple_members for select using (user_id = auth.uid() or app.is_partner(couple_id));
--> statement-breakpoint

-- ---------------------------------------------------------------- invitations (acceptance by token runs in lib/data as service role)
alter table invitations enable row level security;
--> statement-breakpoint
create policy invitations_inviter on invitations for select using (invited_by = auth.uid() or accepted_by = auth.uid());
--> statement-breakpoint
create policy invitations_partner_insert on invitations for insert with check (invited_by = auth.uid() and app.is_partner(couple_id));
--> statement-breakpoint

-- ---------------------------------------------------------------- consent_settings: owner only, every change logged
alter table consent_settings enable row level security;
--> statement-breakpoint
create policy consent_owner on consent_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
alter table consent_changes enable row level security;
--> statement-breakpoint
create policy consent_changes_owner_select on consent_changes for select using (user_id = auth.uid());
--> statement-breakpoint
create policy consent_changes_owner_insert on consent_changes for insert with check (user_id = auth.uid());
--> statement-breakpoint

-- ---------------------------------------------------------------- instrument_definitions: readable by any signed-in user
alter table instrument_definitions enable row level security;
--> statement-breakpoint
create policy instrument_definitions_read on instrument_definitions for select using (auth.uid() is not null);
--> statement-breakpoint

-- ---------------------------------------------------------------- responses: only the owner reads or writes; never a partner
alter table responses enable row level security;
--> statement-breakpoint
create policy responses_owner on responses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint

-- ---------------------------------------------------------------- instrument_completions: owner writes; partner may see completion status only
alter table instrument_completions enable row level security;
--> statement-breakpoint
create policy completions_owner on instrument_completions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
create policy completions_partner_select on instrument_completions for select using (app.is_partner(couple_id));
--> statement-breakpoint

-- ---------------------------------------------------------------- interpretation_runs
alter table interpretation_runs enable row level security;
--> statement-breakpoint
create policy runs_partner_select on interpretation_runs for select using (app.is_partner(couple_id));
--> statement-breakpoint

-- ---------------------------------------------------------------- scores: owner always; partner only per data class and consent
alter table scores enable row level security;
--> statement-breakpoint
create policy scores_owner on scores for select using (user_id = auth.uid());
--> statement-breakpoint
create policy scores_partner on scores for select using (
  exists (
    select 1 from couples c
    join consent_settings cs on cs.user_id = scores.user_id and cs.couple_id = c.id
    where c.id = scores.couple_id
      and (c.partner_a_id = auth.uid() or c.partner_b_id = auth.uid())
      and scores.user_id <> auth.uid()
      and cs.share_relationship_scores = true
      and scores.instrument_key not in ('phq9','gad7','oci_r')
  )
);
--> statement-breakpoint
create policy scores_partner_mh on scores for select using (
  exists (
    select 1 from couples c
    join consent_settings cs on cs.user_id = scores.user_id and cs.couple_id = c.id
    where c.id = scores.couple_id
      and (c.partner_a_id = auth.uid() or c.partner_b_id = auth.uid())
      and scores.user_id <> auth.uid()
      and cs.share_mental_health_scores = true
      and scores.instrument_key in ('phq9','gad7','oci_r')
  )
);
--> statement-breakpoint
create policy scores_clinician on scores for select using (app.has_clinician_link(user_id));
--> statement-breakpoint

-- ---------------------------------------------------------------- couple_scores, flags, interpretations: partners, once both share relationship scores
alter table couple_scores enable row level security;
--> statement-breakpoint
create policy couple_scores_partners on couple_scores for select using (
  app.is_partner(couple_id) and app.both_partners_consent(couple_id, 'relationship')
);
--> statement-breakpoint
alter table flags enable row level security;
--> statement-breakpoint
create policy flags_partners on flags for select using (
  app.is_partner(couple_id) and app.both_partners_consent(couple_id, 'relationship')
);
--> statement-breakpoint
alter table interpretations enable row level security;
--> statement-breakpoint
create policy interpretations_partners on interpretations for select using (
  app.is_partner(couple_id) and app.both_partners_consent(couple_id, 'relationship')
);
--> statement-breakpoint

-- ---------------------------------------------------------------- private_results, profiles: owner only (plus linked clinician for profiles)
alter table private_results enable row level security;
--> statement-breakpoint
create policy private_results_owner on private_results for select using (user_id = auth.uid());
--> statement-breakpoint
create policy private_results_owner_update on private_results for update using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
alter table profiles enable row level security;
--> statement-breakpoint
create policy profiles_owner on profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
create policy profiles_clinician on profiles for select using (app.has_clinician_link(user_id));
--> statement-breakpoint

-- ---------------------------------------------------------------- polarization_responses: owner only
alter table polarization_responses enable row level security;
--> statement-breakpoint
create policy polarization_owner on polarization_responses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint

-- ---------------------------------------------------------------- color layer: owner; partner reads answers only where shareable and the brief exists
alter table color_sessions enable row level security;
--> statement-breakpoint
create policy color_sessions_owner on color_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
create policy color_sessions_partner_status on color_sessions for select using (app.is_partner(couple_id));
--> statement-breakpoint
alter table color_answers enable row level security;
--> statement-breakpoint
create policy color_answers_owner on color_answers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
create policy color_answers_partner_verbatim on color_answers for select using (
  user_id <> auth.uid()
  and shareable_verbatim = true
  and app.is_partner(couple_id)
  and exists (
    select 1 from color_sessions s
    where s.id = color_answers.session_id and app.brief_exists(s.couple_id, s.domain)
  )
);
--> statement-breakpoint
create policy color_answers_clinician on color_answers for select using (app.has_clinician_link(user_id));
--> statement-breakpoint
alter table tags enable row level security;
--> statement-breakpoint
create policy tags_owner on tags for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
create policy tags_partner_after_brief on tags for select using (
  user_id <> auth.uid() and app.is_partner(couple_id) and app.brief_exists(couple_id, domain)
);
--> statement-breakpoint

-- ---------------------------------------------------------------- briefs, plans, revisits: the couple; caregiver sees shared parenting sections only
alter table briefs enable row level security;
--> statement-breakpoint
create policy briefs_partners on briefs for select using (app.is_partner(couple_id));
--> statement-breakpoint
create policy briefs_caregiver on briefs for select using (
  domain = 'parenting' and caregiver_visible = true and app.is_caregiver(couple_id)
);
--> statement-breakpoint
create policy briefs_partners_update on briefs for update using (app.is_partner(couple_id)) with check (app.is_partner(couple_id));
--> statement-breakpoint
alter table plans enable row level security;
--> statement-breakpoint
create policy plans_partners_select on plans for select using (app.is_partner(couple_id));
--> statement-breakpoint
create policy plans_partners_insert on plans for insert with check (app.is_partner(couple_id) and created_by = auth.uid());
--> statement-breakpoint
alter table revisits enable row level security;
--> statement-breakpoint
create policy revisits_partners on revisits for all using (app.is_partner(couple_id)) with check (app.is_partner(couple_id));
--> statement-breakpoint

-- ---------------------------------------------------------------- therapist_shares, exports
alter table therapist_shares enable row level security;
--> statement-breakpoint
create policy therapist_shares_owner on therapist_shares for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
alter table exports enable row level security;
--> statement-breakpoint
create policy exports_select on exports for select using (
  (user_id = auth.uid()) or (couple_id is not null and app.is_partner(couple_id))
);
--> statement-breakpoint

-- ---------------------------------------------------------------- audit_log: a person can see entries where they are the target or the actor; only the service role writes
alter table audit_log enable row level security;
--> statement-breakpoint
create policy audit_log_subject_select on audit_log for select using (target_user_id = auth.uid() or actor_user_id = auth.uid());
--> statement-breakpoint

-- ---------------------------------------------------------------- llm_calls, llm_memo: service role only
alter table llm_calls enable row level security;
--> statement-breakpoint
alter table llm_memo enable row level security;
--> statement-breakpoint

-- ---------------------------------------------------------------- Square One: owner only
alter table square_one_notes enable row level security;
--> statement-breakpoint
create policy square_one_notes_owner on square_one_notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
alter table square_one_requirements enable row level security;
--> statement-breakpoint
create policy square_one_requirements_owner on square_one_requirements for all using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint

-- ---------------------------------------------------------------- child conversation: the couple's partners
alter table child_conversation_answers enable row level security;
--> statement-breakpoint
create policy child_answers_partners on child_conversation_answers for all using (app.is_partner(couple_id)) with check (app.is_partner(couple_id) and recorded_by = auth.uid());
--> statement-breakpoint

-- ---------------------------------------------------------------- clinician and research layer
alter table clinician_links enable row level security;
--> statement-breakpoint
create policy clinician_links_subject on clinician_links for all using (subject_user_id = auth.uid()) with check (subject_user_id = auth.uid());
--> statement-breakpoint
create policy clinician_links_clinician_select on clinician_links for select using (clinician_user_id = auth.uid());
--> statement-breakpoint
alter table sentiment_flags enable row level security;
--> statement-breakpoint
create policy sentiment_flags_clinician on sentiment_flags for select using (app.has_clinician_link(user_id));
--> statement-breakpoint
alter table outcome_reports enable row level security;
--> statement-breakpoint
create policy outcome_reports_researcher on outcome_reports for select using (app.is_researcher());
--> statement-breakpoint
alter table research_agreements enable row level security;
--> statement-breakpoint
create policy research_agreements_own on research_agreements for select using (researcher_user_id = auth.uid());
