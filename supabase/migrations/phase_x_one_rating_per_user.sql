-- Phase X hotfix #2 — one rating per user per salon (Pattern A: Google Maps / Zomato).
-- Re-rating updates the existing row instead of creating a new one. Combined with
-- upsert(onConflict: 'user_id,google_place_id') in the service layer, the rating
-- screen pre-fills with the user's last submission and replaces it on save.

-- If the table currently has duplicate (user_id, google_place_id) rows from the
-- previous insert-only flow, keep only the most recent per pair before adding
-- the constraint.
delete from salon_ratings r
using salon_ratings r2
where  r.user_id         = r2.user_id
  and  r.google_place_id = r2.google_place_id
  and  r.created_at      < r2.created_at;

alter table salon_ratings
  add constraint salon_ratings_user_place_unique unique (user_id, google_place_id);
