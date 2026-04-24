-- Marketing / operating expense line items imported from the "Digital Marketing" sheet.
-- One row per expense. Totals are computed in the dashboard, not stored.

CREATE TABLE IF NOT EXISTS public.marketing_expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date,
  category     text NOT NULL,      -- e.g. 'Meta', 'LinkedIn', 'GoHire', 'SEO', 'Zapier', 'Magna', 'DILO', 'Pabbly', 'Jobsoid', 'Canva', 'CapCut', 'ClaudeAI', 'Frame.io'
  description  text,
  amount       numeric NOT NULL,
  currency     text DEFAULT 'AED',
  created_at   timestamptz DEFAULT now()
);

-- Dedupe key so re-importing the same sheet doesn't double-count
CREATE UNIQUE INDEX IF NOT EXISTS marketing_expenses_uniq
  ON public.marketing_expenses (expense_date, category, amount, COALESCE(description, ''));

ALTER TABLE public.marketing_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_authenticated" ON public.marketing_expenses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_authenticated" ON public.marketing_expenses
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "delete_authenticated" ON public.marketing_expenses
  FOR DELETE TO authenticated USING (true);
