-- Track who got CC'd on each BoldSign envelope so the dashboard can prove,
-- per-document, that admins received the completion email. Populated at
-- send-time by boldsign-send (admins from user_profiles + BOLDSIGN_CC_EMAILS
-- env var). NULL for rows created before this migration.
alter table public.contract_sends
  add column if not exists cc_emails text[] default '{}';
