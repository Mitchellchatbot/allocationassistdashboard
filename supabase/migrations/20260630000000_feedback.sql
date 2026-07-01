-- In-app bug reports + feature suggestions, captured by the floating
-- FeedbackWidget on every page. Context (route, page features from the AI page
-- context, recent client-side errors, browser/viewport) rides along in `context`
-- so a report is actionable without a back-and-forth.

create table if not exists public.feedback (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  -- 'bug' or 'idea' (feature suggestion).
  type           text not null default 'bug'  check (type in ('bug', 'idea')),
  message        text not null,
  -- Friendly page name + route where it was reported (from route-labels).
  page_label     text,
  route          text,
  section        text,
  -- Triage lifecycle.
  status         text not null default 'new'
                 check (status in ('new', 'triaged', 'in_progress', 'done', 'wont_fix')),
  reporter_email text,
  -- Everything auto-captured: viewport, userAgent, ai page-context snapshot,
  -- recent JS errors, current url, etc.
  context        jsonb not null default '{}'::jsonb
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_status_idx  on public.feedback (status);

alter table public.feedback enable row level security;

-- Same policy shape as forms/form_responses: service role full access; any
-- authenticated team member can file + read + triage (this is internal tooling).
create policy "service role full feedback" on public.feedback for all    to service_role  using (true) with check (true);
create policy "auth read feedback"         on public.feedback for select to authenticated using (true);
create policy "auth write feedback"        on public.feedback for all    to authenticated using (true) with check (true);
