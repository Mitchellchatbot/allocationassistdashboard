-- Add call_type column to worker_entries so workers can classify each call
-- as Sales Call / Good Call / Sale Closed. The Performance tab aggregates these.

ALTER TABLE public.worker_entries
  ADD COLUMN IF NOT EXISTS call_type text;

-- Optional: existing rows default to 'Sales Call' so they count toward the total
UPDATE public.worker_entries
  SET call_type = 'Sales Call'
  WHERE call_type IS NULL;
