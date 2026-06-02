-- Replace the expression-based unique index on marketing_expenses with a
-- plain-column one so PostgREST's `on_conflict=expense_date,category,amount,description`
-- can use it as a conflict target (PostgREST does not accept COALESCE(...)
-- as a conflict expression).

UPDATE public.marketing_expenses SET description = '' WHERE description IS NULL;

ALTER TABLE public.marketing_expenses
  ALTER COLUMN description SET DEFAULT '',
  ALTER COLUMN description SET NOT NULL;

-- marketing_expenses_uniq was originally added as a UNIQUE constraint on an
-- expression that included COALESCE(description, ''). PostgREST can't use
-- expression-based constraints as on_conflict targets, so we replace it with
-- a plain-column unique index over the same logical key.
--
-- DROP INDEX can't remove an index that's backing a constraint, so drop the
-- constraint first (which also drops its backing index automatically).
ALTER TABLE public.marketing_expenses
  DROP CONSTRAINT IF EXISTS marketing_expenses_uniq;
DROP INDEX IF EXISTS public.marketing_expenses_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS marketing_expenses_uniq
  ON public.marketing_expenses (expense_date, category, amount, description);
