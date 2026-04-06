# Lumé — AI Grooming Intelligence Platform
# Version 1 — Customer mode only
# Tagline: be you | Brand colour: #C9A84C | Background: #0A0A0A

## What this app is
Lumé analyses a user's face using AI and tells them exactly what grooming
services they need — then shows them nearby salons to get those services done.
Version 1 is customer-only. No stylist profiles, no bookings, no payments.
The app works completely standalone with zero salon partnerships needed.

## Tech stack
- React Native + Expo (managed workflow) — iOS and Android from one codebase
- TypeScript — strict TypeScript always, never plain JavaScript
- Supabase — database, auth, realtime, file storage
- Expo Router — file-based navigation (like Next.js but for mobile)
- Gemini 2.5 Flash-Lite API — face scan vision analysis (cheap, fast, accurate)
- Anthropic Claude Haiku API — grooming advice text generation
- Cloudflare R2 — image storage (zero egress fees)
- Expo Location — device GPS for nearby salon discovery
- Expo Camera — selfie capture for face scan
- Expo Notifications — visit reminders and routine nudges
- React Native Maps — MapLibre for salon discovery map
- Expo Sharing — share score card to WhatsApp and Instagram

## Folder structure — always use this exactly
/app
  /_layout.tsx          — root layout, auth gate
  /(auth)
    /splash.tsx         — animated splash screen
    /signup.tsx         — phone number + Google sign in
    /otp.tsx            — OTP verification screen
    /onboarding.tsx     — name, gender, city collection
  /(tabs)
    /_layout.tsx        — tab bar layout
    /scan.tsx           — scan home + camera + results
    /discover.tsx       — map + nearby salons
    /history.tsx        — scan timeline + routine tracker
    /profile.tsx        — user profile + settings
/components
  /ui/                  — reusable UI primitives
  /scan/                — scan-specific components
  /discover/            — map and salon card components
  /history/             — timeline and routine components
/lib
  /supabase.ts          — Supabase client (single instance)
  /gemini.ts            — Gemini API calls
  /claude.ts            — Claude Haiku API calls
  /storage.ts           — Cloudflare R2 helpers
/services
  /scanService.ts       — orchestrates full scan flow
  /locationService.ts   — location permission + nearby salons
  /notificationService.ts — push notification scheduling
/hooks
  /useAuth.ts           — auth state
  /useScan.ts           — scan state and actions
  /useLocation.ts       — location state
/types
  /index.ts             — all TypeScript types
/constants
  /theme.ts             — colours, spacing, border radius
  /tiers.ts             — score tier labels and thresholds

## Design system — apply to every single screen
Background:       #0A0A0A  (near black — main background)
Surface:          #1A1412  (warm dark — cards and inputs)
Surface2:         #2A2A2A  (slightly lighter — nested elements)
Gold:             #C9A84C  (primary accent — CTAs, highlights, active tabs)
GoldDim:          #2A2010  (gold tint background — badges)
Cream:            #F5F0E8  (primary text on dark)
TextSecondary:    #888888  (secondary text)
TextTertiary:     #555555  (placeholder text)
Border:           #333333  (card borders)
BorderSubtle:     #222222  (dividers)
Danger:           #A32D2D  (destructive actions only)

Typography:
  Title:    Georgia serif, various sizes, color Cream
  Body:     System sans-serif, 13-14px, color Cream or TextSecondary
  Caption:  System sans-serif, 10-11px, color TextSecondary or TextTertiary
  Label:    System sans-serif, 10px, uppercase, letter-spacing 0.06em, color Gold

Border radius:
  Cards:    12px
  Inputs:   10px
  Pills:    999px
  Buttons:  10px
  Icons:    8-10px

All screens: dark theme only. StatusBar style: light-content.
Tab bar background: #111111. Active tab icon and label: #C9A84C.
Inactive tab: #444444.

## Supabase database schema

### Table: public.users
id              uuid PRIMARY KEY REFERENCES auth.users(id)
display_name    text
gender          text  -- 'man' | 'woman' | 'other'
city            text
avatar_url      text
referral_code   text UNIQUE
referred_by     uuid REFERENCES public.users(id)
push_token      text
notification_reminders boolean DEFAULT true
notification_routine   boolean DEFAULT true
last_scan_at    timestamptz
onboarding_complete boolean DEFAULT false
created_at      timestamptz DEFAULT now()

### Table: public.scans
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id         uuid REFERENCES public.users(id)
image_url       text       -- temporary during processing, cleared after
face_shape      text       -- oval | round | square | heart | oblong | diamond
skin_type       text       -- oily | dry | combination | normal | sensitive
skin_concerns   text[]     -- ['acne', 'pigmentation', 'dryness', 'dark_circles']
hair_texture    text       -- straight | wavy | curly | coily
hair_condition  text       -- healthy | dry | damaged | oily | thinning
beard_density   text       -- none | light | medium | heavy (null for women)
brow_shape      text       -- null for men (arch | straight | rounded | sparse)
undereye        text       -- null for men (dark | puffy | hollow | normal)
score_hair      integer    -- 0-100
score_skin      integer    -- 0-100
score_beard     integer    -- 0-100, null for women
score_makeup    integer    -- 0-100, null for men
score_overall   integer    -- average of applicable categories
tier_label      text       -- Needs Work | Developing | Refined | Sharp | Polished | Immaculate
recommendations jsonb      -- structured recommendations object (see format below)
stylist_mentioned text     -- optional name or @handle from "who styled you?"
share_count     integer DEFAULT 0
created_at      timestamptz DEFAULT now()

### Recommendations JSONB format
{
  "hair": {
    "summary": "short 1-line summary",
    "advice": "detailed what to ask for — phrased as exact words to say to stylist",
    "styles": ["Style Name 1", "Style Name 2", "Style Name 3"]
  },
  "skin": {
    "summary": "short 1-line summary",
    "advice": "detailed skincare advice with specific product types",
    "routine": ["step 1", "step 2", "step 3"]
  },
  "beard": {               // men only — null for women
    "summary": "short 1-line summary",
    "advice": "exact words to say to barber about beard shaping"
  },
  "makeup": {              // women only — null for men
    "summary": "short 1-line summary",
    "advice": "specific makeup technique advice for their face features"
  }
}

### Table: public.shadow_stylists
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
name            text
instagram_handle text
salon_name      text
city            text
mention_count   integer DEFAULT 1
mentioned_by    uuid[]     -- array of user_ids who mentioned this person
source          text[]     -- ['user_mention']
outreach_status text DEFAULT 'none'  -- none | contacted | onboarded
created_at      timestamptz DEFAULT now()

### Table: public.waitlist
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
email           text
city            text
created_at      timestamptz DEFAULT now()

### Supabase trigger — CRITICAL, must exist
Create this SQL function and trigger in Supabase:

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

## The AI scan flow — step by step

1. User taps "Scan your face" — camera opens with oval guide overlay
2. User taps capture button — image taken
3. Image compressed to 512x512px on device BEFORE any upload
4. Compressed image uploaded to Cloudflare R2 with temporary signed URL
5. Signed URL sent to Gemini 2.5 Flash-Lite with the VISION PROMPT (see below)
6. Gemini returns structured JSON with face analysis
7. JSON + gender passed to Claude Haiku with the ADVICE PROMPT (see below)
8. Claude Haiku returns recommendations JSON
9. Both combined and saved to public.scans table
10. Image URL cleared from the scan record (privacy — we do not store face photos)
11. Score calculated: average of score_hair + score_skin + score_beard (men)
    or score_hair + score_skin + score_makeup (women)
12. Tier label assigned based on score
13. User sees animated score reveal screen

## Gemini Vision Prompt template
"Analyse this face photo and return ONLY a valid JSON object with no markdown.
Gender context: {gender}

Return exactly this structure:
{
  'face_shape': one of [oval, round, square, heart, oblong, diamond],
  'skin_type': one of [oily, dry, combination, normal, sensitive],
  'skin_concerns': array of applicable [acne, pigmentation, dryness, dark_circles, uneven_tone, oiliness],
  'hair_texture': one of [straight, wavy, curly, coily],
  'hair_condition': one of [healthy, dry, damaged, oily, thinning],
  'beard_density': one of [none, light, medium, heavy] or null if gender is woman,
  'brow_shape': one of [arch, straight, rounded, sparse] or null if gender is man,
  'undereye': one of [dark, puffy, hollow, normal] or null if gender is man,
  'score_hair': integer 0-100 based on hair health and presentation,
  'score_skin': integer 0-100 based on skin clarity and condition,
  'score_beard': integer 0-100 based on beard grooming or null if gender is woman,
  'score_makeup': integer 0-100 based on brow shape and skin evenness or null if gender is man
}"

## Claude Haiku Advice Prompt template
"You are Lumé, an expert grooming advisor. Based on this face analysis, give
personalised grooming recommendations. Be specific — give exact phrases the user
can say to their stylist. Include 3 example style names for hair recommendations.
Gender: {gender}
Face analysis: {gemini_json}

Return ONLY a valid JSON object matching this exact structure:
{
  'hair': {
    'summary': 'one sentence summary of hair recommendation',
    'advice': 'specific advice phrased as exact words to say to stylist in quotes',
    'styles': ['Style Name 1', 'Style Name 2', 'Style Name 3']
  },
  'skin': {
    'summary': 'one sentence summary',
    'advice': 'specific skincare advice with product types, not brand names',
    'routine': ['morning step 1', 'morning step 2', 'evening step 1', 'evening step 2']
  },
  'beard': {'summary': '...', 'advice': '...'} or null if gender is woman,
  'makeup': {'summary': '...', 'advice': '...'} or null if gender is man
}"

## Score tier labels
0-20:   Needs Work
21-40:  Developing
41-60:  Refined
61-75:  Sharp
76-90:  Polished
91-100: Immaculate

## Location permission flow — IMPORTANT
Never jump straight to the OS location dialogue.
Always show Lumé's own explanation screen first:
  Screen: "Find salons near you"
  Explain: what you use location for + that you never track in background
  Two buttons: "Allow location access" | "Enter city manually instead"

When user taps "Allow location access" — THEN trigger the OS permission request.
When user taps "Enter city manually" — show city text input, search salons by city.
When permission is denied — show city manual entry, never show an error dead end.

## Women vs men differences — apply consistently
Women (gender = 'woman'):
  Score categories: Hair, Skin, Makeup
  Score tab shows: score_hair, score_skin, score_makeup
  Recommendations show: Hair section, Skin section, Makeup section
  Beard section: hidden completely
  Gemini prompt: includes brow_shape and undereye, beard_density is null
  
Men (gender = 'man' or 'other'):
  Score categories: Hair, Skin, Beard
  Score tab shows: score_hair, score_skin, score_beard
  Recommendations show: Hair section, Skin section, Beard section
  Makeup section: hidden completely
  Gemini prompt: includes beard_density, brow_shape and undereye are null

## Recommendations format on screen
Each recommendation section shows:
1. Category label (uppercase, gold, letter-spaced)
2. "What to ask for" — advice phrased as exact words in quotes
3. For hair only: 3 style reference cards (name + placeholder illustration)
   Selected style has gold border. User can tap to select preferred style.
4. For skin: routine steps listed simply

## Environment variables (.env file)
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
EXPO_PUBLIC_ANTHROPIC_API_KEY=your_claude_haiku_api_key
EXPO_PUBLIC_R2_ACCOUNT_ID=your_cloudflare_r2_account_id
EXPO_PUBLIC_R2_ACCESS_KEY=your_r2_access_key
EXPO_PUBLIC_R2_BUCKET=lume-scans

## Coding rules — non-negotiable
1. Never hardcode API keys — only use process.env.EXPO_PUBLIC_*
2. All Supabase calls go through /lib/supabase.ts only
3. All AI calls go through /lib/gemini.ts and /lib/claude.ts only
4. Functional components only — no class components ever
5. Always show loading state during async operations
6. Always handle and display errors — never silent failures
7. Compress images to 512x512 before any upload or API call
8. Delete face scan images from storage after processing — never store permanently
9. Row Level Security enabled on all Supabase tables — users see only their data
10. Every screen must be tested mentally at 375px width (small phone)
11. Use expo-image-manipulator for image compression
12. Use expo-location for location — always request permission before accessing
13. Never use position: fixed or absolute for main layout elements

## Build order — sprints
Sprint 1: Setup + auth + navigation skeleton (current sprint)
Sprint 2: Face scan + Gemini + Claude + score reveal
Sprint 3: Recommendations screen + share card + stylist tag field
Sprint 4: Discover tab + location permission + map + salon cards
Sprint 5: History tab + scan timeline + routine tracker
Sprint 6: Profile tab + settings + notifications + onboarding polish
Sprint 7: Bug fixes + performance + App Store submission prep

## What NOT to build in Version 1
- Stylist profiles or stylist mode (Version 2)
- Booking system or payments (Version 2)
- Lumé Pro subscription (Version 2)
- Virtual try-on (Version 3)
- Product shop (Version 3)
- Loyalty points (Version 2)
- Social features or community (Version 3)