-- Per-hospital control over the email greeting name. When false (default) the
-- greeting renders the HOSPITAL name ("Hello City Hospital!"); when true it uses
-- the named CONTACT person ("Hello Ms. Sandra!"), falling back to the hospital
-- name if no contact is on file. send-flow-email + the Send Profile preview
-- resolve the {{hospital_contact_name}} token from this flag.

alter table public.hospitals
  add column if not exists greet_with_contact_name boolean not null default false;
