-- Multi-contact email routing per hospital. A hospital has several Zoho
-- contacts (Primary / Secondary, synced into zoho_cache.hospitalContacts).
-- Each hospital chooses how a profile send picks its ONE recipient:
--   'primary' — always the hospital's Primary contact.
--   'cycle'   — round-robin through the hospital's contacts; cycle_cursor
--               tracks which contact is next, and advances on each send.
-- greet_with_contact_name (already present) drives direct addressing — the
-- chosen contact's own name in the greeting instead of the hospital name.
-- excluded_contact_emails lets a hospital drop specific contacts from the
-- primary/cycle rotation without touching Zoho.

alter table public.hospitals
  add column if not exists contact_mode text not null default 'primary'
    check (contact_mode in ('primary', 'cycle')),
  add column if not exists cycle_cursor int not null default 0,
  add column if not exists excluded_contact_emails text[] not null default '{}';
