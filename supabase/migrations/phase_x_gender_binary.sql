-- Phase X hotfix: simplify gender to binary man/woman for v1.
-- 'other' and 'prefer_not_to_say' removed from the CHECK constraint.
-- Existing rows with these values are NOT migrated — they remain in DB as-is.
-- The CHECK constraint WILL prevent NEW inserts with these values.
-- If existing rows fail validation on subsequent updates, those updates will
-- fail; this is acceptable since founder confirmed test data wipe is upcoming.

alter table public.users
  drop constraint if exists users_gender_check;

alter table public.users
  add constraint users_gender_check
  check (gender in ('man', 'woman') or gender is null);
