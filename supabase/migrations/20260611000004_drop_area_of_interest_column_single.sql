-- The single-doctor hospital email (profile_sent_hospital) prints the area of
-- interest as the {{doctor_bio}} paragraph BEFORE the table (WP has no
-- separate bio, so doctor_bio = area_of_interest), and then repeats it in an
-- "Area of Interest" table column. Drop the redundant column (header + cell).
update public.email_templates
set body_html = replace(
                  replace(
                    body_html,
                    '<th style="text-align:left;border:1px solid #cbd5e1;padding:6px 10px;width:240px;">Area of Interest</th>',
                    ''
                  ),
                  '<td style="border:1px solid #cbd5e1;padding:6px 10px;width:240px;white-space:normal;word-break:break-word;">{{doctor_area_of_interest}}</td>',
                  ''
                )
where key = 'profile_sent_hospital';
