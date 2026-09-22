-- Remember which placement rows a person edited by hand.
--
-- A monthly sheet is the truth for its own month: re-importing it should
-- correct dates that came from an older copy of that sheet. It must never
-- overwrite what someone typed in Processing or Reports. Rows created by the
-- app already say so in `source` ('manual', 'flow_marked', 'contract_checkin');
-- what was missing is a mark on a SHEET-imported row that has since been
-- edited by hand. useUpsertPlacementAttempt and useMarkPlacementMilestone now
-- stamp this column, and the importer leaves any stamped row alone.

alter table public.placement_attempts
  add column if not exists manual_edited_at timestamptz;

comment on column public.placement_attempts.manual_edited_at is
  'When a person last changed this row in the app. The sheet importer never overwrites a row that has this set.';
