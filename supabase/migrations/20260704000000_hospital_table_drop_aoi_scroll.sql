-- profile_sent_hospital data table cleanup:
--   1. Drop the "Area of Interest" column (header + cell). It duplicates the
--      {{doctor_bio}} paragraph printed right above the table (WP has no separate
--      bio, so bio = area of interest) — and its long text was blowing the table
--      up. The earlier drop (20260611000004) was undone when the image-swap
--      migration (20260702000001) re-set the whole table.
--   2. Give the header cells white-space:nowrap and wrap the whole table in an
--      overflow-x:auto box, so the wide data table scrolls on its own — in the
--      dashboard preview AND in Gmail — instead of crushing its columns.
--
-- Targeted string replaces against the body set by 20260702000001. No-op if the
-- markup has since diverged.
update public.email_templates
set body_html =
  replace(
    replace(
      replace(
        replace(
          replace(
            body_html,
            '<th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;">Area of Interest</th>',
            ''
          ),
          '<td style="border:1px solid #cbd5e1;padding:6px 10px;">{{doctor_area_of_interest}}</td>',
          ''
        ),
        -- nowrap every header cell (th style is unique — td cells omit text-align)
        'text-align:left;border:1px solid #cbd5e1;padding:6px 10px;"',
        'text-align:left;border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap;"'
      ),
      '<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a2332;border:1px solid #cbd5e1;margin:18px 0;">',
      '<div style="overflow-x:auto;max-width:100%;margin:18px 0;"><table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a2332;border:1px solid #cbd5e1;">'
    ),
    '</table>',
    '</table></div>'
  )
where key = 'profile_sent_hospital';
