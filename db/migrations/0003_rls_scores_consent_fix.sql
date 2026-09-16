-- The partner-read policies on scores (copied from the build prompt) read consent_settings inline.
-- consent_settings is owner-only under RLS, so the inline subquery never saw the partner's consent
-- row and the policies could never grant. Read consent through the security-definer helper instead.
drop policy if exists scores_partner on scores;
--> statement-breakpoint
drop policy if exists scores_partner_mh on scores;
--> statement-breakpoint
create policy scores_partner on scores for select using (
  scores.user_id <> auth.uid()
  and app.is_partner(scores.couple_id)
  and scores.instrument_key not in ('phq9','gad7','oci_r')
  and app.consents(scores.user_id, scores.couple_id, 'relationship')
);
--> statement-breakpoint
create policy scores_partner_mh on scores for select using (
  scores.user_id <> auth.uid()
  and app.is_partner(scores.couple_id)
  and scores.instrument_key in ('phq9','gad7','oci_r')
  and app.consents(scores.user_id, scores.couple_id, 'mental_health')
);
