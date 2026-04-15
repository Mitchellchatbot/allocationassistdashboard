-- Drop the self-referential admin policy — it causes infinite recursion in RLS
-- because the subquery on user_profiles triggers the same policy again.
-- Admin reads all profiles via the get-users edge function (service role) instead.
drop policy if exists "admins read all profiles" on public.user_profiles;
