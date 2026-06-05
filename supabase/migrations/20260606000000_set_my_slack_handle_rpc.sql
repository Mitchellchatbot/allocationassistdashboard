-- Tiny RPC so signed-in users can manage their own slack_handle
-- without us either (a) loosening the user_profiles UPDATE RLS to
-- allow row-wide writes (role-escalation risk) or (b) shipping a
-- dedicated edge function for one field.
--
-- The function runs SECURITY DEFINER as the table owner, but is
-- locked to the calling user's row via auth.uid() — they can ONLY
-- write their own slack_handle, never anyone else's, never role
-- or allowed_pages.
--
-- Upserts by primary key (id). If the row doesn't exist yet — rare,
-- but possible for accounts created outside the create-user flow —
-- we'll seed it with the email pulled from the JWT so the lookup
-- in notify() still resolves them.

create or replace function public.set_my_slack_handle(handle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid;
  v_email  text;
  v_clean  text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Strip leading @ (users tend to type their handle with the @ prefix)
  -- and treat empty/whitespace as "clear it".
  v_clean := nullif(regexp_replace(coalesce(handle, ''), '^@', ''), '');
  v_clean := nullif(trim(coalesce(v_clean, '')), '');

  v_email := coalesce((auth.jwt() ->> 'email')::text, '');

  insert into public.user_profiles (id, email, slack_handle)
  values (v_uid, v_email, v_clean)
  on conflict (id) do update
    set slack_handle = excluded.slack_handle;
end;
$$;

grant execute on function public.set_my_slack_handle(text) to authenticated;
