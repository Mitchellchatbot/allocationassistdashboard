-- Screenshots for feedback reports: a public Storage bucket + a column on
-- feedback holding the uploaded image URLs. The FeedbackWidget lets you paste
-- (Ctrl/Cmd+V anywhere), drag-drop, or pick image files.

alter table public.feedback
  add column if not exists screenshots text[] not null default '{}';

-- Public bucket so the reports UI can <img src> the screenshots directly.
insert into storage.buckets (id, name, public)
values ('feedback', 'feedback', true)
on conflict (id) do nothing;

-- Any authenticated team member can upload a screenshot; anyone can read
-- (public bucket). Guarded so re-running the migration is safe.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'auth upload feedback shots'
  ) then
    create policy "auth upload feedback shots"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'feedback');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'public read feedback shots'
  ) then
    create policy "public read feedback shots"
      on storage.objects for select to public
      using (bucket_id = 'feedback');
  end if;
end $$;
