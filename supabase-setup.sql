-- ═══════════════════════════════════════════════════════════
-- LUMÉ DATABASE SETUP
-- Paste all of this into Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════


-- ─── 1. TABLES ──────────────────────────────────────────────

CREATE TABLE public.users (
  id                     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name           text,
  gender                 text CHECK (gender IN ('man', 'woman', 'other')),
  city                   text,
  avatar_url             text,
  referral_code          text UNIQUE,
  referred_by            uuid REFERENCES public.users(id),
  push_token             text,
  notification_reminders boolean DEFAULT true,
  notification_routine   boolean DEFAULT true,
  last_scan_at           timestamptz,
  onboarding_complete    boolean DEFAULT false,
  created_at             timestamptz DEFAULT now()
);

CREATE TABLE public.scans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES public.users(id) ON DELETE CASCADE,
  image_url         text,
  face_shape        text CHECK (face_shape IN ('oval','round','square','heart','oblong','diamond')),
  skin_type         text CHECK (skin_type IN ('oily','dry','combination','normal','sensitive')),
  skin_concerns     text[],
  hair_texture      text CHECK (hair_texture IN ('straight','wavy','curly','coily')),
  hair_condition    text CHECK (hair_condition IN ('healthy','dry','damaged','oily','thinning')),
  beard_density     text CHECK (beard_density IN ('none','light','medium','heavy')),
  brow_shape        text CHECK (brow_shape IN ('arch','straight','rounded','sparse')),
  undereye          text CHECK (undereye IN ('dark','puffy','hollow','normal')),
  score_hair        integer CHECK (score_hair BETWEEN 0 AND 100),
  score_skin        integer CHECK (score_skin BETWEEN 0 AND 100),
  score_beard       integer CHECK (score_beard BETWEEN 0 AND 100),
  score_makeup      integer CHECK (score_makeup BETWEEN 0 AND 100),
  score_overall     integer CHECK (score_overall BETWEEN 0 AND 100),
  tier_label        text,
  recommendations   jsonb,
  stylist_mentioned text,
  share_count       integer DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE public.shadow_stylists (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text,
  instagram_handle text,
  salon_name       text,
  city             text,
  mention_count    integer DEFAULT 1,
  mentioned_by     uuid[],
  source           text[],
  outreach_status  text DEFAULT 'none' CHECK (outreach_status IN ('none','contacted','onboarded')),
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE public.waitlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  city       text,
  created_at timestamptz DEFAULT now()
);


-- ─── 2. ROW LEVEL SECURITY — enable on all tables ───────────

ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_stylists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist        ENABLE ROW LEVEL SECURITY;


-- ─── 3. RLS POLICIES ────────────────────────────────────────

-- Users table: each user can only see and edit their own row
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Scans table: each user can only see and manage their own scans
CREATE POLICY "Users can view own scans"
  ON public.scans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scans"
  ON public.scans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scans"
  ON public.scans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scans"
  ON public.scans FOR DELETE
  USING (auth.uid() = user_id);

-- Shadow stylists: any logged-in user can read, insert, update (crowd-sourced data)
CREATE POLICY "Authenticated users can view shadow stylists"
  ON public.shadow_stylists FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert shadow stylists"
  ON public.shadow_stylists FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update shadow stylists"
  ON public.shadow_stylists FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Waitlist: anyone can add themselves (no login required)
CREATE POLICY "Anyone can join waitlist"
  ON public.waitlist FOR INSERT
  WITH CHECK (true);


-- ─── 4. AUTO-CREATE USER ROW ON SIGNUP ──────────────────────
-- When someone signs up via Supabase Auth, this trigger automatically
-- creates their row in public.users with a unique 6-character referral code.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, referral_code)
  VALUES (
    new.id,
    upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
