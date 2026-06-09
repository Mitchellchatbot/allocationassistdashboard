-- Widen the profile_sent_hospital spec-sheet table so long values (esp.
-- "Area of Interest") stop cramping into a narrow column and wrapping onto
-- many lines. Ammar 2026-06-09: "it's very big now because of the area of
-- interest… make the column wider."
--
-- Surgical string-replace on the live template (instead of restating the
-- whole 90-line HTML) so this stays in lockstep with whatever's in the DB:
--   1. table-layout:fixed on the inner spec-sheet table so column widths
--      are actually honoured (without it the browser/inbox auto-sizes from
--      content and the value column collapses around long text).
--   2. label column 42% -> 36%, value column gets an explicit 64% — more
--      horizontal room for the value text.
--   3. word-break on every value cell so a long unbroken token can't blow
--      the column back out.

update public.email_templates
set body_html =
  replace(
    replace(
      replace(
        replace(
          body_html,
          -- 1) inner spec-sheet table: pin the layout
          'style="width:100%;background:#fafbfc;border:1px solid #e8ecf0;border-radius:10px;"',
          'style="width:100%;background:#fafbfc;border:1px solid #e8ecf0;border-radius:10px;table-layout:fixed;"'
        ),
        -- 2a) first label cell defines the (fixed) label column width
        'font-weight:500;width:42%;vertical-align:top;">Title &amp; Specialty</td>',
        'font-weight:500;width:36%;vertical-align:top;">Title &amp; Specialty</td>'
      ),
      -- 2b) first value cell (the only one without a border-top) defines the
      --     value column width
      '<td style="padding:10px 22px;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;">{{doctor_title}}</td>',
      '<td style="padding:10px 22px;width:64%;font-size:13px;color:#1a2332;vertical-align:top;line-height:1.55;word-break:break-word;">{{doctor_title}}</td>'
    ),
    -- 3) every remaining value cell gets word-break (they all end the same way)
    'vertical-align:top;line-height:1.55;">',
    'vertical-align:top;line-height:1.55;word-break:break-word;">'
  ),
  updated_at = now()
where key = 'profile_sent_hospital';
