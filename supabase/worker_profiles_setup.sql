-- Set up user_profiles rows for the 7 worker accounts so they:
--   1. Get role="worker" → only have access to /worker (not admin pages)
--   2. Have full_name set so the worker portal can match them to weekly_sales rows

INSERT INTO user_profiles (id, role, allowed_pages, full_name)
VALUES
  ('e3e728b5-f6e1-4220-b3cc-b2bb415f8b8c', 'worker', ARRAY['/worker'], 'Abraham'),
  ('45695222-fcfa-46d3-b5a9-972a6255064d', 'worker', ARRAY['/worker'], 'Ahmed'),
  ('449b9bce-ccfc-4121-a6ed-1371542349a7', 'worker', ARRAY['/worker'], 'Asser'),
  ('ff735bd7-be05-41c6-9312-6bf0cf20863f', 'worker', ARRAY['/worker'], 'Mohamed Othaman'),
  ('9c7dd124-eb43-43a0-8187-e4851d4b0b91', 'worker', ARRAY['/worker'], 'Peter'),
  ('9ecee50a-7cf6-4a9e-9564-668bcc3b2dad', 'worker', ARRAY['/worker'], 'Sohaila'),
  ('eff81531-50aa-4abc-afed-7a54c87d8ac7', 'worker', ARRAY['/worker'], 'Sumia')
ON CONFLICT (id) DO UPDATE
  SET role          = EXCLUDED.role,
      allowed_pages = EXCLUDED.allowed_pages,
      full_name     = EXCLUDED.full_name;
