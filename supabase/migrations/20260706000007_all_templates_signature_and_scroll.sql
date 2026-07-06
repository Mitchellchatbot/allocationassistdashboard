-- Sweep EVERY email template (all flows, incl. the "alt" ones — attestation,
-- onboarding, interview, intake, reminders) so they all carry the branded
-- signature and any data table scrolls (Hasan 2026-07-06: "even for the alt
-- templates, we want all of them to have signatures and also … scrollable
-- things"). Idempotent: a no-op for templates already in good shape.

-- ── 1) Ensure the branded {{signature}} block on every HTML body ─────────────
-- send-flow-email / send-batch / the template-editor preview all inject the
-- signature into {{signature}}, so appending the token is enough. Templates that
-- already have it are skipped. (A couple of legacy templates keep a hard-coded
-- "The Allocation Assist team" line above the branded block — harmless.)
update public.email_templates
set body_html = rtrim(coalesce(body_html, '')) || E'\n{{signature}}',
    updated_at = now()
where coalesce(body_html, '') not like '%{{signature}}%';

-- Plain-text bodies get the text signature token (send-flow-email fills
-- {{signature_text}}; templates already carrying either token are skipped).
update public.email_templates
set body_text = rtrim(coalesce(body_text, '')) || E'\n\n{{signature_text}}',
    updated_at = now()
where coalesce(body_text, '') not like '%{{signature}}%'
  and coalesce(body_text, '') not like '%{{signature_text}}%';

-- ── 2) Make every literal DATA table horizontally scrollable ─────────────────
-- Wrap each <table> in an overflow-x:auto box so wide tables scroll instead of
-- crushing. Gated to bodies that (a) contain a <th> — the marker of a real data
-- table (email layout tables use <td>, so they're left alone) — and (b) don't
-- already have a scroll wrapper, so we never double-wrap. The profile-send
-- tables render via {{doctor_row_table_html}} / {{doctors_table_html}} tokens
-- (already scrollable), so this only catches any literal tables in older bodies.
update public.email_templates
set body_html = regexp_replace(
      regexp_replace(body_html, '(<table[^>]*>)', '<div style="overflow-x:auto;max-width:100%;margin:12px 0;">\1', 'g'),
      '(</table>)', '\1</div>', 'g'),
    updated_at = now()
where body_html like '%<th%'
  and body_html not like '%overflow-x:auto%';
