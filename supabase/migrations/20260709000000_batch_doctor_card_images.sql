-- Daily Duo = two individual profiles (like Profile Sent), not one wide table.
-- Store one profile-card image URL per queued doctor, aligned to doctor_ids
-- order. The images are generated client-side (html2canvas, same pipeline as the
-- single Profile Sent send) when the batch is built, since the scheduled send
-- runs server-side (tick-scheduler → send-batch) where no browser exists.
-- send-batch embeds them as two stacked <img> blocks for daily_duo; an empty
-- slot (or the '{}' default on older rows / other kinds) falls back to the
-- per-doctor card / combined table render, so nothing breaks.
alter table public.scheduled_batch_sends
  add column if not exists doctor_card_image_urls text[] not null default '{}';
