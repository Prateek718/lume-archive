# Redundancy Audit — Detail Screens

Scope: `app/skin-detail.tsx`, `app/hair-detail.tsx`, `app/beard-detail.tsx`, `app/makeup-detail.tsx`, `app/recommendations.tsx`, plus `lib/gemini.ts::buildRecsPrompt` / `buildHairRecsPrompt`.

---

## 1. `app/recommendations.tsx`

No tabs. Header + 3 category cards (Hair, Skin, Beard/Makeup).

### Sections (per card)
| Field | Source |
|---|---|
| `title` | Static ("Hair" / "Skin" / "Beard" / "Makeup" / "Scalp Care" if bald) |
| `meta` (e.g. "4 steps · 3 products") | Computed locally from `hairRecs`, `rec.products`, `rec.skin.routine` |
| `tags` pills | `scan.skin_type`, `scan.skin_concerns[0..1]`, `scan.brow_condition`, `scan.undereye`, `scan.beard_condition ?? beard_density`, `hairProfile.texture`, `hairProfile.primary_concern` |
| `preview` (2-line truncated) | AI — `rec.skin.summary`, `rec.beard.summary`, `rec.makeup.summary`, `hairRecs.summary` |

### Copy patterns
Preview text is the AI-generated **summary** field. Example from Gemini prompt framing rules: "summary: 1 sentence maximum, 20 words maximum" → previews here are short. Low redundancy within this screen.

---

## 2. `app/skin-detail.tsx`

Tabs: **Analysis | Routine**

### Analysis tab
| # | Section | Data | Source |
|---|---|---|---|
| 1 | `WHAT WE FOUND` card — skin-type pill + paragraph | `scan.skin_type` + `SKIN_TYPE_EXPLANATIONS[skin_type]` | Static dictionary (file-local) |
| 2 | `DETECTED CONCERNS` card — list + 5-dot severity meter | `scan.skin_concerns` + `CONCERN_SEVERITY` | Static dictionary, keyed on concern |
| 3 | `PRIORITY FOCUS` card — advice paragraph | `PRIORITY_FOCUS[topConcern]` | Static dictionary, keyed on top concern |

### Routine tab
| # | Section | Data | Source |
|---|---|---|---|
| 1 | `YOUR SKIN NEEDS` card — advice paragraph | `rec.skin.advice` | AI (Gemini `buildRecsPrompt`) |
| 2 | `MORNING ROUTINE` card — numbered step rows | `rec.skin.routine.morning` (label, product) | AI |
| 3 | `EVENING ROUTINE` card — numbered step rows | `rec.skin.routine.evening` | AI |

### Copy patterns
All Analysis-tab text is static. Examples:
- `WHAT WE FOUND / oily`: "Your skin produces more sebum than average, giving it a shiny appearance — especially across the T-zone."
- `PRIORITY FOCUS / acne`: "Address breakouts first — they affect both skin health and confidence."

Redundancy here is mild because the copy comes from a hand-written dictionary, not the LLM. No face-shape mentions. But:

### Cross-section redundancy
- **`DETECTED CONCERNS` (§2) and `PRIORITY FOCUS` (§3)** overlap. The severity dots already highlight which concern is top; the Priority Focus card then restates "address [top concern] first" as prose. Two UI patterns for the same "this is what matters most" message.

### Cross-tab redundancy
- The Routine tab's numbered step product-name strings ("Gel cleanser", "Niacinamide serum") restate information the Analysis tab's `WHAT WE FOUND` already implies via skin-type. Minor — the step labels are the actionable form.

### Cross-screen redundancy
- `rec.skin.summary` renders on `recommendations.tsx` as the Skin card preview. Skin-detail does **not** also show that summary — good. However, the concern pills on the recommendations card (`skinTags = skin_type + concerns[0..1]`) reappear verbatim on Analysis tab (skin-type pill inside `WHAT WE FOUND` + concern rows in `DETECTED CONCERNS`).

---

## 3. `app/hair-detail.tsx`

Tabs: **Style | Care | Products**

### Style tab
| # | Section | Data | Source |
|---|---|---|---|
| 1 | `HAIR SUMMARY` card | `hairRecs.summary` | AI (Gemini `buildHairRecsPrompt`) |
| 2 | `WHAT TO ASK YOUR STYLIST` card — italic quote | `hairRecs.advice` | AI |
| 3 | `STYLES THAT SUIT YOU` card — stacked style subcards (detailed), each with name + `why_face_shape` line + `why_texture` line + `climate_note` + maintenance dot | `hairRecs.styles_detailed[!avoid]` | AI |
| 4 | **Inside §3** — stacked "NOT RECOMMENDED" subcards | `hairRecs.styles_detailed[avoid]` | AI |
| (fallback) | Simple 3-pill picker + "See photos" search button | `hairRecs.styles` | AI |

### Care tab
| # | Section | Data | Source |
|---|---|---|---|
| 1 | `WHY YOUR HAIR NEEDS THIS` | `hairRecs.condition_explanation` | AI |
| 2 | `WASH DAYS — <frequency>` | `hairRecs.wash_frequency` + `wash_steps[]` | AI |
| 3 | `ONCE A WEEK` | `hairRecs.weekly_treatment` | AI |
| 4 | `YOUR ROUTINE` — numbered step rows (tap → product picker sheet) | `hairRecs.routine[]` filtered by `routine_level` | AI |

### Products tab
| # | Section | Data | Source |
|---|---|---|---|
| 1 | `noBrandsBanner` (if no preferred brands) | Static copy | Static |
| 2 | Collapsible category tiles (one per matched category) — header chevron; expand reveals match-meter, "Your brand" badge, product name/brand/price, `catRec.reason`, Buy button | `hairRecs.products[].{category,name,brand,reason,match_score}` + `PRODUCTS` catalogue | AI reason + static catalogue |
| 3 | `upsellCard` (simple routine level only) | Static | Static |

### Copy patterns
Quoting the prompt contract, Gemini must return styles_detailed with **both** `why_face_shape` **and** `why_texture` as separate fields per style. In practice these two sentences overlap heavily — the model restates context to fill both slots. Likely output (based on prompt schema):
- `why_face_shape`: "This works well with your oval face shape…"
- `why_texture`: "With your wavy texture, this style…"

Both restate "your [trait]" instead of just stating what to do.

Also: `HAIR SUMMARY` (§1) and `WHAT TO ASK YOUR STYLIST` (§2) both compress the same recommendation — a 20-word summary and a 2-sentence advice. The advice almost always contains the summary's claim plus a little more.

### Cross-section redundancy (Style tab)
- **§1 `HAIR SUMMARY` vs §2 `WHAT TO ASK YOUR STYLIST`** — summary is a strict subset of advice. Two cards, one idea.
- **§3 per-style `why_face_shape` vs `why_texture`** — the schema forces double-reasoning. Usually either one would convey the recommendation.
- **§4 "NOT RECOMMENDED" styles inside a card titled "Styles That Suit You"** — asymmetric (2-3 suit-you subcards then 1 avoid subcard under the same heading). The presence of styles on the recommended list already implies others don't fit; the avoid card adds one counterexample without systematic coverage.

### Cross-tab redundancy
- **Care §4 `YOUR ROUTINE` ↔ Products tab**: routine steps open the `ProductPickerSheet` for the step's category, showing matched products. The Products tab shows the same per-category products inline. Two entry points into identical data (sheet vs. inline tile).

### Cross-screen redundancy
- `hairRecs.summary` is rendered as the Hair card preview on `recommendations.tsx` **and again** as §1 `HAIR SUMMARY` card on this screen. The user sees the exact same sentence twice in a row on tap-through.

---

## 4. `app/beard-detail.tsx`

Tabs: **Shape | Routine | Products**

### Shape tab
| # | Section | Data | Source |
|---|---|---|---|
| 1 | `YOUR BEARD PROFILE` — density pill + face-shape pill | `scan.beard_density` + `scan.face_shape` | Scan fields (AI) |
| 2 | `WHAT TO ASK YOUR BARBER` — italic quote | `rec.beard.advice` | AI |
| 3 | `SHAPE THAT SUITS YOUR FACE` — named style + description paragraph | `FACE_SHAPE_BEARD[face_shape]` | **Static** dictionary, keyed on face shape |
| 4 | "See \<style\> photos" Google search link button | derived from §3 | Static + derived |
| 5 | `Styles for your face + beard` sub-heading + stacked style subcards (name, why, maintenance dot) | `rec.beard.beard_styles[!not_recommended]` | AI |
| 6 | **Inside §5** — `NOT RECOMMENDED` subcards | `rec.beard.beard_styles[not_recommended]` | AI |

### Routine tab
| # | Section | Data | Source |
|---|---|---|---|
| 1 | Condition callout — `THE HONEST TRUTH` / `LOOKING GOOD` / `NEEDS ATTENTION` card | `scan.beard_condition` → static copy | Static (3 hard-coded messages) |
| 2 | `DAILY` card — numbered steps (tap → product picker) | `DAILY_STEPS` (3 fixed strings) | Static |
| 3 | `WEEKLY` card — numbered steps (tap → product picker) | `WEEKLY_STEPS` (4 fixed strings) | Static |
| 4 | `NECKLINE GUIDE` — two paragraphs | Static | Static |

### Products tab
Identical structure to hair-detail Products: noBrandsBanner + collapsible category tiles with match meter + `catRec.reason`.

### Copy patterns
- **Static `FACE_SHAPE_BEARD` every entry starts with "A \<shape\> face …"**:
  - `oval`: "An oval face is the most versatile — most beard shapes work well."
  - `round`: "A round face benefits from length at the chin to create the illusion of a more oval shape."
  - `heart`: "A heart-shaped face has a wider forehead and narrower chin."
- **AI `beard_styles[*].why`** is prompted to combine "face shape + condition reason" in one field — so every AI style's `why` also mentions face shape.

Two independent sources (static dictionary + AI field) both hinge on face shape in the same tab. The framing "suits your face" / "works with your <shape> face" repeats across §3 and §5.

### Cross-section redundancy (Shape tab)
- **§3 `SHAPE THAT SUITS YOUR FACE` (static) vs §5 `Styles for your face + beard` (AI)** — this is the biggest overlap on any detail screen. Both answer "what beard should I grow?" keyed off `face_shape`. Static gives one named style + long paragraph; AI gives 2-3 named styles + short reasons. If AI is working, the static card duplicates it. If AI is missing/empty, the static card is a fallback. They should not both fire.
- **§5 recommended (2-3) + §6 NOT RECOMMENDED (1)** — same asymmetry as hair-detail. One negative example under a heading about recommendations is lopsided.
- **§2 `WHAT TO ASK YOUR BARBER` advice** usually names the same style class that §3 (static) and §5 (AI) both describe — third restatement in the same tab.

### Cross-section redundancy (Routine tab)
- `DAILY_STEPS` and `WEEKLY_STEPS` are **not conditional on `beard_density` or `beard_condition`**. If density is `none` or `light`, step 1 "Comb your beard in the direction of growth" is nonsensical. The `THE HONEST TRUTH` card above acknowledges patchiness but the routine below still presents full-beard maintenance — the condition card and routine contradict each other.
- `NECKLINE GUIDE` is always rendered regardless of beard length — if user has stubble, there's no neckline to set.

### Cross-tab redundancy
- Routine `DAILY` / `WEEKLY` steps open the product picker for mapped beard categories (beard_oil/beard_wash/beard_balm). Products tab shows those same categories inline. Two paths to the same products.

### Cross-screen redundancy
- `rec.beard.summary` on `recommendations.tsx` Beard card preview — no dedicated summary card on beard-detail, so this one is OK.
- `beard_density` + `beard_condition` tags on the recommendations card reappear as pills inside `YOUR BEARD PROFILE` (§1). Same data, same render, one screen apart.

---

## 5. `app/makeup-detail.tsx`

Tabs: **Features | Technique | Products**

### Features tab
| # | Section | Data | Source |
|---|---|---|---|
| 1 | `YOUR FEATURE PROFILE` — brow pill + undereye pill | `scan.brow_condition`, `scan.undereye` | Scan (AI) |
| 2 | `YOUR BROWS` card — paragraph | `BROW_EXPLANATIONS[brow_condition]` | **Static** |
| 3 | `YOUR UNDER-EYE AREA` card — paragraph | `UNDEREYE_EXPLANATIONS[undereye]` | **Static** |
| 4 | `KEY INSIGHT` card — single italic-quoted sentence | Static copy branched on `primaryFeature` (first non-null among brow_condition==sparse, undereye==dark, undereye==puffy, any brow_condition) | **Static** |
| 5 | "See \<brow\> makeup photos" Google search button | Derived | Static + derived |

### Technique tab
| # | Section | Data | Source |
|---|---|---|---|
| 1 | `ADVISOR NOTES` — italic quote | `rec.makeup.advice` | AI |
| 2 | `BROW TECHNIQUE` card — feature label pill + paragraph | `BROW_TECHNIQUE[brow_condition]` | **Static** |
| 3 | `UNDER-EYE TECHNIQUE` card | `UNDEREYE_TECHNIQUE[undereye]` | **Static** |
| 4 | `YOU DON'T NEED A BASE` card (conditional on `!needsBase`) | Static copy | Static |
| 5 | `YOUR ROUTINE` card — numbered step rows (tap → picker) | Computed `makeupRoutineSteps` from scan fields | Computed |

### Products tab
Same pattern as hair/beard products.

### Copy patterns
Four static dictionaries keyed on the same two fields:
- `BROW_EXPLANATIONS[sparse]`: "Your brows are naturally lighter or thinner in density, which can make the eye area appear less defined."
- `KEY INSIGHT / brow density`: "Sparse brows respond better to technique than product quantity — three precise strokes outperform a full brow pencil stroke every time."
- `BROW_TECHNIQUE[sparse]`: "Use a micro-tip brow pencil to draw individual feather strokes…"

Three cards across two tabs all fire on `brow_condition === 'sparse'`. Same for the undereye set (three cards on `undereye === 'dark'`: `YOUR UNDER-EYE AREA`, `KEY INSIGHT`, `UNDER-EYE TECHNIQUE`).

### Cross-section redundancy (Features tab)
- **§1 `YOUR FEATURE PROFILE` pills** re-label the same fields that then appear as headers/feature-label pills inside §2 and §3. The pills are a mini-legend for cards immediately below — redundant when the cards already name the feature.
- **§2 `YOUR BROWS` ↔ §4 `KEY INSIGHT` (when primaryFeature='brow density')** — both fire on `brow_condition === 'sparse'`. The explanation describes the condition; the insight distills one sentence of advice. The insight is a subset of what §3 (Technique tab `BROW TECHNIQUE`) will say in full. `KEY INSIGHT` feels like a teaser for a tab the user has not yet opened.

### Cross-tab redundancy
- **Features §2 `YOUR BROWS` (what your brows are) ↔ Technique §2 `BROW TECHNIQUE` (what to do)** — clean split in intent, but the explanations are linked paragraphs keyed on the same scalar and will read as paired on the same page. Not strictly redundant; `KEY INSIGHT` in the middle blurs the line.
- Technique §5 `YOUR ROUTINE` opens product picker; Products tab shows inline — same duplication as hair/beard.

### Cross-screen redundancy
- `rec.makeup.summary` on recommendations card preview — no dedicated summary card on makeup-detail, so OK.
- `brow_condition` + `undereye` tags on recommendations card reappear as pills in Features §1. Same data, second surface.

---

## 6. Prompt-level redundancy (`lib/gemini.ts`)

### `buildRecsPrompt`

**FRAMING RULES (lines 319-325)** actually target the *opposite* problem — they tell the model to reframe rather than restate ("To brighten the under-eye area…" not "you have dark circles"). Good.

But two schema choices push the other direction:

1. **`beard_styles[*].why` is defined as "face shape + condition reason"** (prompt line 452). The model must fit both into one string, so every AI beard style's `why` restates face shape. The detail screen then shows that *next to* the static `FACE_SHAPE_BEARD` paragraph which is also face-shape-derived. Double face-shape talk is structurally baked in.

2. **Summary + advice both required** (lines 324, 482). Summary ≤ 20 words, advice ≤ 2 sentences. The information set overlaps — any recommendation short enough to fit in 20 words is already inside the 2-sentence advice. The detail screens render both as separate cards, then the recommendations screen renders the summary a third time.

### `buildHairRecsPrompt`

1. **`styles_detailed[*]` schema has both `why_face_shape` and `why_texture` as separate string fields** (lines 704-706). The model must produce two reasons per style. In practice the two reasons are near-duplicates because "this style suits you" is one thought, not two. This is the largest structural driver of hair-detail copy bloat.

2. **Same summary + advice double** as buildRecsPrompt.

3. **`condition_explanation` (2-3 sentences) + `weekly_treatment` paragraph + `wash_steps[]` + `routine[]`** all describe care cadence. Four fields that overlap in "how often / with what".

---

## Consolidation Proposal

Ranked high → low impact. All changes are UI-side only unless marked **[prompt]**.

### P1 — Kill the `why_face_shape` / `why_texture` split **[prompt]**
Change `styles_detailed` schema in `buildHairRecsPrompt` so each style has a single `why` field (≤ 1 sentence, ≤ 20 words). Drop the two-line render in hair-detail Style tab §3. Single largest source of restate-the-trait copy. Also apply to beard `beard_styles[*].why` — tighten the prompt to ban "your <shape> face" openings ("Write what to do, not what the user is").

### P2 — Drop `SHAPE THAT SUITS YOUR FACE` (static) on beard-detail
AI `beard_styles` (§5) covers the same ground with more personalisation (2-3 named styles, condition-aware). Keep the static dictionary only as the fallback when `rec.beard.beard_styles` is empty/missing. Move the "See photos" button to key off the top AI style. Eliminates the duplicate face-shape prose in the Shape tab.

### P3 — Remove "NOT RECOMMENDED" subcards (hair + beard)
In both hair-detail Style §4 and beard-detail Shape §6, one avoid entry alongside 2-3 recommendations is asymmetric. Presence on the list = recommendation; absence = not. The avoid card adds noise without systematic coverage. If you want to teach "don't do X", a separate "Common mistakes" card with 2-3 entries would be better — but current single-avoid renders as tacked-on.

### P4 — Merge `KEY INSIGHT` into `YOUR BROWS` / `YOUR UNDER-EYE AREA` on makeup-detail
`KEY INSIGHT` is a static one-sentence gloss keyed on the same scalar as the explanation card above it. Either append the insight line to the matching explanation paragraph, or drop it — the Technique tab already delivers the actionable version. Also consider dropping `YOUR FEATURE PROFILE` (§1) since its pills just re-label the two cards immediately below.

### P5 — Merge `DETECTED CONCERNS` + `PRIORITY FOCUS` on skin-detail
The severity dots already mark the top concern. Collapse §2 and §3: render the concerns list with the top concern visually lifted (larger type, attached focus paragraph) instead of a separate card. One scan of concerns, one paragraph, one card.

### P6 — Drop `HAIR SUMMARY` card on hair-detail Style tab
`hairRecs.summary` already shows as the Hair card preview on `recommendations.tsx`. Rendering it again as the first card on tap-through is duplication at 1-second intervals. `WHAT TO ASK YOUR STYLIST` carries the actionable content. (Alternative: drop the preview from the recommendations card — but the preview does useful work at the selection step, so drop the detail-screen card instead.)

### P7 — Pick one entry point into products per detail screen
Today hair / beard / makeup detail screens expose the same matched products via:
- Routine step-row taps (opens `ProductPickerSheet` bottom sheet), and
- Products tab (inline collapsible tiles).

Recommend: remove `onPress` + ProductPickerSheet from routine step rows. Routine-tab steps become purely informational (technique/cadence); product discovery happens in the Products tab. Deletes ~40 lines per screen and one of the two product surfaces.

### P8 — Make beard-detail Routine tab responsive to `beard_density` / `beard_condition`
`DAILY_STEPS` + `WEEKLY_STEPS` + `NECKLINE GUIDE` currently render for every user regardless of whether they have a beard. If `beard_density` is `none` or `light`, swap to a growth-focused static track (or hide). The condition-card at the top already acknowledges patchiness but is then contradicted by the full-beard routine below.

### P9 — Drop summary-field from prompt OR from detail screens **[prompt or UI]**
`summary` (≤ 20 words) and `advice` (≤ 2 sentences) are near-duplicates by construction. Two options:
- (a) drop `summary` from `buildRecsPrompt` / `buildHairRecsPrompt`, and use the first sentence of `advice` for the recommendations preview; or
- (b) keep both in the data but never render both on the same screen — recommendations preview uses `summary`, detail screens use `advice` only.

(b) is the cheaper change and gets most of the benefit.

### P10 — Trim the hair Care tab to one cadence source **[prompt + UI]**
`condition_explanation`, `wash_steps`, `weekly_treatment`, and `routine` all cover frequency/technique. Consolidate to: one `condition_explanation` paragraph + one ordered `routine` (with per-step cadence in the step). Drop `wash_steps` and `weekly_treatment` from the prompt. Four cards become two.
