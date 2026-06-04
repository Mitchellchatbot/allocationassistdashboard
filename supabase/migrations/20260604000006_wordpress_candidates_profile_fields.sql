-- Extend wordpress_candidates with the profile-card fields the WP site
-- renders publicly: avatar URL + single education + single experience
-- entry (the WP CPT only has one slot of each — no repeater).
--
-- We could keep these inside raw_acf and parse client-side, but materialising
-- them as real columns lets us index/search and keeps the React side dumb.

alter table public.wordpress_candidates
  add column if not exists photo_url               text,

  add column if not exists education_title         text,
  add column if not exists education_academy       text,
  add column if not exists education_start         text,
  add column if not exists education_end           text,
  add column if not exists education_present       boolean,
  add column if not exists education_description   text,

  add column if not exists experience_title        text,
  add column if not exists experience_company      text,
  add column if not exists experience_start        text,
  add column if not exists experience_end          text,
  add column if not exists experience_present      boolean,
  add column if not exists experience_description  text;
