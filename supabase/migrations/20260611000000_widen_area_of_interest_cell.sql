-- The live profile_sent_hospital template is the horizontal 15-column
-- "plinky" spec table (one row per doctor). The earlier widen migration
-- (20260609000002) targeted the OLD vertical 2-column layout, so its
-- string-replaces never matched this table and no-opped.
--
-- Area of Interest is now sent in FULL (the AI condense that "cut" it was
-- removed from send-flow-email / send-batch, Ammar 2026-06-11). To keep a
-- long value from stretching the table, bound the Area-of-Interest column
-- and let it wrap. Targets the exact th + value cell from the live template
-- (both strings are unique — the column label and the {{token}}).

update public.email_templates
set body_html =
  replace(
    replace(
      body_html,
      '<th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Area of Interest</th>',
      '<th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;width:240px;">Area of Interest</th>'
    ),
    '<td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_area_of_interest}}</td>',
    '<td style="border:1px solid #cbd5e1;padding:6px 10px;width:240px;white-space:normal;word-break:break-word;">{{doctor_area_of_interest}}</td>'
  ),
  updated_at = now()
where key = 'profile_sent_hospital';
