-- ─── Salon Ratings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.salon_ratings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid REFERENCES public.users(id),
  google_place_id          text NOT NULL,
  salon_name               text NOT NULL,
  rating_overall           numeric(2,1),
  rating_ambience          numeric(2,1),
  rating_price_value       numeric(2,1),
  rating_staff             numeric(2,1),
  rating_hygiene           numeric(2,1),
  rating_stylist_skill     numeric(2,1),
  haircut_price_tier_men   text CHECK (haircut_price_tier_men   IN ('under_200','200_500','500_1000','above_1000')),
  haircut_price_tier_women text CHECK (haircut_price_tier_women IN ('under_600','600_1000','1000_1500','above_1500')),
  created_at               timestamptz DEFAULT now()
);

ALTER TABLE public.salon_ratings ENABLE ROW LEVEL SECURITY;

-- Users can insert their own ratings
CREATE POLICY "salon_ratings_insert"
  ON public.salon_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Anyone can read (for salon detail display)
CREATE POLICY "salon_ratings_select"
  ON public.salon_ratings FOR SELECT
  USING (true);

-- ─── Stylist Ratings ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stylist_ratings (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid REFERENCES public.users(id),
  stylist_name              text NOT NULL,
  instagram_handle          text,
  salon_name                text,
  google_place_id           text,
  rating_skill              numeric(2,1),
  rating_listened           numeric(2,1),
  rating_face_understanding numeric(2,1),
  would_return              boolean,
  created_at                timestamptz DEFAULT now()
);

ALTER TABLE public.stylist_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stylist_ratings_insert"
  ON public.stylist_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "stylist_ratings_select"
  ON public.stylist_ratings FOR SELECT
  USING (true);
