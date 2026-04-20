# Lumé — UI Audit

Generated: 2026-04-20. No files were modified. Raw findings only.

---

## 1. Full contents of constants/theme.ts

```ts
export const Colors = {
  background: '#F7F4EF',   // main screen background
  surface:    '#EDE6DC',   // cards, inputs, nested elements
  surface2:   '#E2D9CC',   // deeper nested elements
  card:       '#FFFFFF',   // pure white cards
  text:       '#2C2420',   // primary text (dark warm brown)
  text2:      '#8A7E76',   // secondary text
  text3:      '#B0A49A',   // tertiary / placeholder
  accent:     '#C17B5C',   // CTAs, highlights, active tab
  green:      '#7A9E7E',   // healthy / positive
  border:     '#D8CFC4',   // card borders, dividers
  border2:    '#EAE3DA',   // subtle dividers

  tabBar:     '#FFFFFF',
  tabActive:  '#C17B5C',
  tabInactive:'#B0A49A',
} as const;

export const Typography = {
  serif:   'Georgia',
  sans:    undefined,      // system default

  size: {
    xs:   10,
    sm:   11,
    base: 13,
    md:   14,
    lg:   16,
    xl:   20,
    xxl:  24,
    xxxl: 32,
  },

  letterSpacing: {
    label: 0.06,
  },
} as const;

export const Spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  xxl:  32,
  xxxl: 48,
} as const;

export const Radius = {
  card:  12,
  input: 10,
  pill:  999,
  icon:  10,
} as const;
```

---

## 2. Hardcoded color audit

### app/(auth)/login.tsx
| Line | Code |
|------|------|
| 325 | `backgroundColor: '#FFFFFF',` |
| 335 | `googleIcon: { fontSize: 18, color: '#4285F4', fontWeight: '700' },` |
| 336 | `googleText: { color: '#1C1816', fontWeight: '600', fontSize: 15 },` |

### app/(auth)/signup.tsx
| Line | Code |
|------|------|
| 242 | `backgroundColor: '#FFFFFF',` |
| 252 | `googleIcon: { fontSize: 18, color: '#4285F4', fontWeight: '700' },` |
| 253 | `googleText: { color: '#1C1816', fontWeight: '600', fontSize: 15 },` |

### app/(auth)/otp.tsx
No hardcoded hex colors or rgba values.

### app/(auth)/onboarding.tsx
No hardcoded hex colors or rgba values.

### app/(auth)/splash.tsx
No hardcoded hex colors or rgba values.

### app/(tabs)/scan.tsx
| Line | Code |
|------|------|
| 269 | `fill="#6B8CAE" fillOpacity="0.2"` (SVG attr — dark-circles eye highlight) |
| 270 | `stroke="#6B8CAE" strokeWidth="0.5" strokeOpacity="0.6"` |
| 272 | `fill="#6B8CAE" fillOpacity="0.2"` |
| 273 | `stroke="#6B8CAE" strokeWidth="0.5" strokeOpacity="0.6"` |
| 274 | `<Circle cx="33" cy="56" r="3" fill="#6B8CAE" fillOpacity="0.7" />` |
| 275 | `<Circle cx="67" cy="56" r="3" fill="#6B8CAE" fillOpacity="0.7" />` |
| 295 | `fill="#3A6B3A" fillOpacity="0.12"` (SVG attr — healthy cheeks) |
| 296 | `stroke="#3A6B3A" strokeWidth="0.5" strokeOpacity="0.35"` |
| 298 | `fill="#3A6B3A" fillOpacity="0.12"` |
| 299 | `stroke="#3A6B3A" strokeWidth="0.5" strokeOpacity="0.35"` |
| 305 | `fill="none" stroke="#444" strokeWidth="0.8"` (SVG — eyes) |
| 307 | `fill="none" stroke="#444" strokeWidth="0.8"` |
| 308 | `<Circle cx="33" cy="52" r="2" fill="#333" />` |
| 309 | `<Circle cx="67" cy="52" r="2" fill="#333" />` |
| 313 | `fill="none" stroke="#333" strokeWidth="0.8"` (SVG — nose) |
| 317 | `fill="none" stroke="#444" strokeWidth="0.8"` (SVG — mouth) |
| 328 | `backgroundColor: '#6B8CAE'` (legend dot — dark circles) |
| 333 | `backgroundColor: '#3A6B3A'` (legend dot — healthy) |
| 455 | `overlay: { ... backgroundColor: 'rgba(0,0,0,0.55)' }` |
| 458 | `cameraHint: { ... color: 'rgba(255,255,255,0.75)', ... }` |
| 463 | `backgroundColor: 'rgba(10,10,10,0.6)',` (camera bottom bar) |
| 469 | `borderColor: 'rgba(255,255,255,0.8)',` (capture ring) |
| 472 | `captureInner: { ... backgroundColor: '#FFFFFF' }` |
| 476 | `backgroundColor: 'rgba(255,255,255,0.15)',` (flip icon circle) |
| 477 | `borderColor: 'rgba(255,255,255,0.3)',` |
| 480 | `flipIconText: { color: '#FFFFFF', ... }` |
| 481 | `errorBanner: { ... backgroundColor: '#A32D2D', ... }` |
| 592 | `pillHealthy: { backgroundColor: '#1A2A1A', ... }` |
| 599 | `pillHealthyText: { ... color: '#5A9A5A', ... }` |

### app/(tabs)/discover.tsx
No hardcoded hex colors or rgba values. All tokens.

### app/(tabs)/profile.tsx
| Line | Code |
|------|------|
| 548 | `deleteText: { fontSize: 13, color: '#A32D2D' },` |

### app/(tabs)/routine.tsx
| Line | Code |
|------|------|
| 654 | `hairSetupBox: { ... borderColor: 'rgba(230,199,156,0.5)', ... }` |

### app/recommendations.tsx
| Line | Code |
|------|------|
| 294 | `concernPill: { backgroundColor: '#F5EAE4', ... }` |
| 296 | `healthyPill: { backgroundColor: '#EAF2EB', ... }` |

### app/hair-detail.tsx
| Line | Code |
|------|------|
| 55 | `low: Colors.green ?? '#7A9E7E',` (fallback — never triggers since token exists) |
| 57 | `high: '#E24B4A',` (red for high-maintenance) |
| 555 | `avoidCard: { backgroundColor: '#FEF6F2', ... borderColor: '#E8C4B4', ... }` |
| 557 | `avoidName: { ... color: '#7A4A38', ... }` |
| 558 | `avoidReason: { ... color: '#7A4A38', ... }` |
| 572 | `borderColor: Colors.accent, backgroundColor: 'rgba(230,199,156,0.12)',` |
| 588 | `backgroundColor: Colors.surface, borderColor: 'rgba(230,199,156,0.4)',` |
| 610 | `backgroundColor: 'rgba(230,199,156,0.08)', borderColor: 'rgba(230,199,156,0.4)',` |
| 611 | `borderColor: 'rgba(230,199,156,0.4)',` |
| 621 | `preferredBadge: { ... backgroundColor: 'rgba(230,199,156,0.2)', ... }` |

### app/beard-detail.tsx
| Line | Code |
|------|------|
| 249 | `backgroundColor: 'rgba(230,199,156,0.12)',` |
| 576 | `honestCard: { backgroundColor: '#FEF6F2', ... borderColor: '#E8C4B4', ... }` |
| 578 | `honestBody: { ... color: '#7A4A38', ... }` |
| 579 | `goodCard: { backgroundColor: '#EAF2EB', ... borderColor: '#C8DFC9', ... }` |
| 581 | `goodBody: { ... color: '#4A7A4E', ... }` |
| 592 | `maintHigh: { backgroundColor: '#E24B4A' }` |
| 594 | `avoidCard: { backgroundColor: '#FEF6F2', ... borderColor: '#E8C4B4', ... }` |
| 596 | `avoidName: { ... color: '#7A4A38', ... }` |
| 597 | `avoidReason: { ... color: '#7A4A38', ... }` |
| 603 | `borderColor: 'rgba(230,199,156,0.4)',` |
| 625 | `backgroundColor: 'rgba(230,199,156,0.08)', borderColor: 'rgba(230,199,156,0.4)',` |
| 636 | `preferredBadge: { ... backgroundColor: 'rgba(230,199,156,0.2)', ... }` |

### app/makeup-detail.tsx
| Line | Code |
|------|------|
| 305 | `backgroundColor: 'rgba(230,199,156,0.12)',` |
| 583 | `noBaseCard: { backgroundColor: '#EAF2EB', ... borderColor: '#C8DFC9', ... }` |
| 585 | `noBaseBody: { ... color: '#4A7A4E', ... }` |
| 591 | `borderColor: 'rgba(230,199,156,0.4)',` |
| 613 | `backgroundColor: 'rgba(230,199,156,0.08)', borderColor: 'rgba(230,199,156,0.4)',` |
| 624 | `preferredBadge: { ... backgroundColor: 'rgba(230,199,156,0.2)', ... }` |

### app/skin-detail.tsx
No hardcoded hex colors or rgba values. All tokens.

### app/hair-profile.tsx
| Line | Code |
|------|------|
| 487 | `errorText: { fontSize: 13, color: '#A32D2D', ... }` |

### app/salons/nearby.tsx
| Line | Code |
|------|------|
| 437 | `listThumbOverlay: { ... backgroundColor: 'rgba(0,0,0,0.2)' }` |
| 449 | `openBadge: { ... backgroundColor: '#1A3A1A', ... }` |
| 450 | `closedBadge: { backgroundColor: '#3A1A1A' }` |
| 451 | `openBadgeText: { ... color: '#6BCB77', ... }` |
| 456 | `backgroundColor: 'rgba(230,199,156,0.18)',` |
| 458 | `borderColor: 'rgba(230,199,156,0.45)',` |

### app/salons/salon-detail.tsx
| Line | Code |
|------|------|
| 295 | `servicePill: { backgroundColor: 'rgba(230,199,156,0.18)', ... }` |
| 297 | `borderColor: 'rgba(230,199,156,0.45)',` |
| 307 | `claimCard: { borderColor: 'rgba(230,199,156,0.5)', ... }` |

### app/salons/salon-profile-create.tsx
| Line | Code |
|------|------|
| 99 | `pillActive: { backgroundColor: 'rgba(230,199,156,0.18)', borderColor: 'rgba(230,199,156,0.5)' }` |
| 501 | `phoneError: { ... color: '#E24B4A', ... }` |
| 514 | `optionRowActive: { backgroundColor: 'rgba(230,199,156,0.12)' }` |
| 559 | `confirmCheck: { backgroundColor: 'rgba(93,202,165,0.15)', borderColor: '#5DCAA5', ... }` |
| 566 | `confirmCheckText: { ... color: '#5DCAA5' }` |

### app/salons/rate-salon.tsx
| Line | Code |
|------|------|
| 435 | `pillActive: { backgroundColor: 'rgba(230,199,156,0.18)', ... }` |
| 436 | `borderColor: 'rgba(230,199,156,0.5)',` |

### app/salons/rate-stylist.tsx
| Line | Code |
|------|------|
| 367 | `pillActiveNo: { backgroundColor: '#3A1A1A', borderColor: '#A32D2D' },` |
| 370 | `pillTextActiveNo: { color: '#FF6B6B' },` |

### app/profile/my-brands.tsx
| Line | Code |
|------|------|
| 251 | `pillSelected: { backgroundColor: 'rgba(230,199,156,0.18)', ... }` |
| 252 | `borderColor: 'rgba(230,199,156,0.5)',` |
| 276 | `refreshOverlay: { ... backgroundColor: 'rgba(28,24,22,0.88)', ... }` |

### app/profile/routine-level.tsx
No hardcoded hex colors or rgba values.

### components/ProductPickerSheet.tsx
| Line | Code |
|------|------|
| 164 | `overlay: { ... backgroundColor: 'rgba(44, 36, 32, 0.5)' }` |
| 214 | `cardFeatured: { backgroundColor: '#FEF6F2', ... }` |
| 233 | `featuredBadgeText: { ... color: '#FFFFFF' }` |

### components/ui/StarRating.tsx
No hardcoded hex colors (uses Colors.accent and Colors.border tokens).

---

## 3. Theme import audit

| File | Imports theme? | Tokens used |
|------|---------------|-------------|
| app/_layout.tsx | YES | Colors |
| app/index.tsx | NO | — (redirect only, no UI) |
| app/(auth)/_layout.tsx | YES | Colors |
| app/(auth)/splash.tsx | YES | Colors, Typography, Spacing |
| app/(auth)/login.tsx | YES | Colors, Typography, Spacing, Radius |
| app/(auth)/signup.tsx | YES | Colors, Typography, Spacing, Radius |
| app/(auth)/otp.tsx | YES | Colors, Typography, Spacing, Radius |
| app/(auth)/onboarding.tsx | YES | Colors, Typography, Spacing, Radius |
| app/(tabs)/_layout.tsx | YES | Colors |
| app/(tabs)/scan.tsx | YES | Colors, Typography, Spacing, Radius |
| app/(tabs)/discover.tsx | YES | Colors, Typography, Spacing, Radius |
| app/(tabs)/profile.tsx | YES | Colors, Typography, Spacing, Radius |
| app/(tabs)/routine.tsx | YES | Colors, Typography, Spacing, Radius |
| app/recommendations.tsx | YES | Colors, Typography, Spacing |
| app/skin-detail.tsx | YES | Colors, Typography, Spacing, Radius |
| app/hair-detail.tsx | YES | Colors, Typography, Spacing, Radius |
| app/beard-detail.tsx | YES | Colors, Typography, Spacing, Radius |
| app/makeup-detail.tsx | YES | Colors, Typography, Spacing, Radius |
| app/hair-profile.tsx | YES | Colors, Typography, Spacing, Radius |
| app/salons/_layout.tsx | YES | Colors |
| app/salons/nearby.tsx | YES | Colors, Typography, Spacing, Radius |
| app/salons/salon-detail.tsx | YES | Colors, Typography, Spacing, Radius |
| app/salons/salon-profile-create.tsx | YES | Colors, Typography, Spacing (missing Radius) |
| app/salons/rate-salon.tsx | YES | Colors, Typography, Spacing, Radius |
| app/salons/rate-stylist.tsx | YES | Colors, Typography, Spacing, Radius |
| app/profile/my-brands.tsx | YES | Colors, Typography, Spacing, Radius |
| app/profile/routine-level.tsx | YES | Colors, Typography, Spacing, Radius |
| components/ui/StarRating.tsx | YES | Colors |
| components/ProductPickerSheet.tsx | YES | Colors |

All files import from theme. `app/index.tsx` has no UI so no import needed.

---

## 4. StyleSheet color usage — every color-related property

### app/_layout.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| (inline View) | backgroundColor | Colors.background |
| Stack screenOptions contentStyle | backgroundColor | Colors.background |

### app/(auth)/splash.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| container | backgroundColor | Colors.background |
| diamond | backgroundColor | Colors.accent |
| brand | color | Colors.text |
| tagline | color | Colors.text2 |

### app/(auth)/login.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| flex | backgroundColor | Colors.background |
| container | — | — |
| title | color | **Colors.surface** (low contrast on background) |
| subtitle | color | Colors.text2 |
| input | backgroundColor | Colors.surface, borderColor | Colors.border, color | Colors.text |
| passwordInput | backgroundColor | Colors.surface, borderColor | Colors.border, color | Colors.text |
| ctaButton | backgroundColor | Colors.accent |
| ctaText | color | **Colors.surface** (text on accent button) |
| forgotText | color | Colors.text |
| googleBtn | backgroundColor | **#FFFFFF** (hardcoded — should be Colors.card) |
| googleIcon | color | **#4285F4** (hardcoded Google brand color) |
| googleText | color | **#1C1816** (hardcoded — similar but not Colors.text) |
| dividerLine | backgroundColor | Colors.border |
| dividerLabel | color | Colors.text2 |
| switchText | color | Colors.text2 |
| switchTextBold | color | **Colors.surface** (same low-contrast concern as title) |
| (ActivityIndicator) | color | Colors.surface |

### app/(auth)/signup.tsx
Same pattern as login.tsx — identical issues:
| Style key | Property | Value |
|-----------|----------|-------|
| flex | backgroundColor | Colors.background |
| title | color | **Colors.surface** |
| subtitle | color | Colors.text2 |
| input | backgroundColor | Colors.surface, borderColor | Colors.border, color | Colors.text |
| ctaButton | backgroundColor | Colors.accent |
| ctaText | color | **Colors.surface** |
| googleBtn | backgroundColor | **#FFFFFF** (hardcoded) |
| googleIcon | color | **#4285F4** (hardcoded) |
| googleText | color | **#1C1816** (hardcoded) |
| dividerLine | backgroundColor | Colors.border |
| switchTextBold | color | **Colors.surface** |

### app/(auth)/otp.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| root | backgroundColor | Colors.background |
| title | color | **Colors.surface** |
| subtitle | color | Colors.text2 |
| input | backgroundColor | Colors.surface, borderColor | Colors.border, color | Colors.text |
| ctaButton | backgroundColor | Colors.accent |
| ctaText | color | **Colors.surface** |
| sentNote | color | Colors.text2 |
| retryText | color | Colors.text |
| backText | color | Colors.text2 |

### app/(auth)/onboarding.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| flex | backgroundColor | Colors.background |
| backArrow | color | **Colors.surface** |
| dot | backgroundColor | **Colors.surface** (progress dots — beige on beige) |
| dotActive | backgroundColor | Colors.accent |
| title | color | **Colors.surface** |
| subtitle | color | Colors.text2 |
| input | backgroundColor | Colors.surface, borderColor | Colors.border, color | Colors.text |
| genderCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| genderCardActive | borderColor | Colors.accent, backgroundColor | Colors.surface2 |
| genderLabel | color | Colors.text2 |
| genderLabelActive | color | Colors.text |
| cta | backgroundColor | Colors.accent |
| ctaText | color | **Colors.surface** |
| ageCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| ageCardActive | borderColor | Colors.accent, backgroundColor | Colors.surface2 |
| ageLabel | color | Colors.text2 |
| ageLabelActive | color | Colors.text |
| routineCol | backgroundColor | Colors.surface, borderColor | Colors.border |
| routineDivider | backgroundColor | Colors.border |
| routineLabel | color | Colors.text2 |
| routineLabelActive | color | Colors.text |
| routineSub | color | Colors.text3 |
| radioOuter | borderColor | Colors.text2 |
| radioOuterActive | borderColor | Colors.accent |
| radioInner | backgroundColor | Colors.accent |
| privacyNote | color | Colors.text2 |
| (ActivityIndicator) | color | Colors.surface |

### app/(tabs)/scan.tsx
**HomeScreen styles (s):**
| Style key | Property | Value |
|-----------|----------|-------|
| fill | backgroundColor | Colors.background |
| brand | color | Colors.text |
| scanRing | borderColor | Colors.accent |
| scanRingLabel | color | Colors.accent |
| scanInstruction | color | Colors.text2 |
| ctaButton | backgroundColor | Colors.accent |
| ctaText | color | **Colors.surface** |
| cancelLinkText | color | Colors.text |
| overlay | backgroundColor | **rgba(0,0,0,0.55)** |
| ovalGuide | borderColor | Colors.accent |
| cameraHint | color | **rgba(255,255,255,0.75)** |
| cameraBottomBar | backgroundColor | **rgba(10,10,10,0.6)** |
| cameraTextBtnLabel | color | Colors.accent |
| captureOuter | borderColor | **rgba(255,255,255,0.8)** |
| captureInner | backgroundColor | **#FFFFFF** (should be Colors.card) |
| flipIconCircle | backgroundColor | **rgba(255,255,255,0.15)**, borderColor | **rgba(255,255,255,0.3)** |
| flipIconText | color | **#FFFFFF** |
| errorBanner | backgroundColor | **#A32D2D** |
| errorText | color | Colors.text |
| permissionTitle | color | **Colors.surface** |
| permissionBody | color | Colors.text |
| processingStep | color | **Colors.surface** |
| processingNote | color | Colors.text2 |
| privacyNote | color | Colors.text3 |

**ObservationScreen styles (rs):**
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| mapCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| legendDot | (dynamic) | Colors.accent / **#6B8CAE** / **#3A6B3A** |
| legendText | color | Colors.text2 |
| summaryCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| summaryLabel | color | Colors.text2 |
| summaryText | color | Colors.text |
| pillConcern | backgroundColor | Colors.surface2 |
| pillConcernText | color | Colors.accent |
| pillHealthy | backgroundColor | **#1A2A1A** (hardcoded dark near-black green) |
| pillHealthyText | color | **#5A9A5A** (hardcoded medium green) |
| deltaCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| cta | backgroundColor | Colors.accent |
| ctaLoading | backgroundColor | Colors.text2 |
| ctaLoadingText | color | Colors.card |
| ctaError | backgroundColor | Colors.accent |
| ctaText | color | Colors.background |
| privacyNote | color | Colors.text3 |

### app/(tabs)/discover.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| title | color | **Colors.surface** (headings on light background) |
| subtitle | color | Colors.text2 |
| suggestionCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| suggestionLabel | color | Colors.text2 |
| suggestionService | color | Colors.text |
| suggestionReason | color | Colors.text2 |
| suggestionCta | color | Colors.accent |
| actionCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| actionIconBox | backgroundColor | Colors.surface2 |
| actionIcon | color | Colors.accent |
| actionTitle | color | Colors.text |
| actionSubtitle | color | Colors.text2 |
| actionArrow | color | Colors.text3 |
| sectionLabel | color | **Colors.surface** (label on background) |
| emptyCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| emptyText | color | Colors.text3 |
| ratingRow | backgroundColor | Colors.surface, borderColor | Colors.border |
| ratingName | color | Colors.text |
| ratingDate | color | Colors.text2 |
| (MiniStars) | color | Colors.accent / Colors.border |

### app/(tabs)/profile.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| avatar | backgroundColor | Colors.surface, borderColor | Colors.accent |
| avatarText | color | Colors.accent |
| heroName | color | **Colors.surface** |
| heroCity | color | Colors.text |
| tierCard | backgroundColor | Colors.surface, borderColor | Colors.accent |
| scanDateText | color | Colors.text2 |
| viewRecsLink | color | Colors.accent |
| tierPill | backgroundColor | Colors.surface2 |
| tierPillText | color | Colors.accent |
| noScanCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| noScanText | color | Colors.text2 |
| viewAllText | color | Colors.text |
| sectionLabel | color | **Colors.surface** |
| card | backgroundColor | Colors.surface, borderColor | Colors.border |
| rowLabel | color | Colors.text |
| rowSub | color | Colors.text2 |
| rowValue | color | Colors.text2 |
| rowArrow | color | Colors.accent |
| divider | backgroundColor | Colors.border2 |
| timeBtn | backgroundColor | Colors.surface2 |
| timeBtnText | color | Colors.accent |
| accountActions | borderTopColor | Colors.border |
| signOutText | color | **Colors.surface** |
| actionsDivider | backgroundColor | Colors.border |
| deleteText | color | **#A32D2D** (hardcoded danger red) |
| Switch | trackColor false | Colors.border, true | Colors.accent, thumbColor | Colors.text |
| (Notifications) | lightColor | Colors.accent |

### app/(tabs)/routine.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| headerTitle | color | **Colors.surface** |
| pill | backgroundColor | Colors.surface, borderColor | Colors.border |
| pillActive | backgroundColor | Colors.accent, borderColor | Colors.accent |
| pillText | color | Colors.text |
| pillTextActive | color | **Colors.surface** |
| emptyTitle | color | **Colors.surface** |
| emptyBody | color | Colors.text |
| emptyBtn | backgroundColor | Colors.accent |
| emptyBtnText | color | **Colors.surface** |
| streakCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| streakNum | color | Colors.accent |
| streakLabel | color | Colors.text2 |
| streakBest | color | Colors.text2 |
| streakToday | color | Colors.text |
| streakBar | backgroundColor | Colors.border |
| streakFill | backgroundColor | Colors.accent |
| toggleRow | backgroundColor | Colors.surface, borderColor | Colors.border |
| toggleBtnAM | backgroundColor | Colors.accent |
| toggleBtnPM | backgroundColor | Colors.surface2 |
| toggleBtnText | color | Colors.text2 |
| toggleBtnTextAM | color | **Colors.surface** |
| toggleBtnTextPM | color | Colors.text |
| washCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| washTitle | color | Colors.text |
| washSub | color | Colors.text2 |
| washStats | borderTopColor | Colors.border |
| washStatNum | color | Colors.text |
| washStatLabel | color | Colors.text2 |
| washStatDivider | backgroundColor | Colors.border |
| stepRow | backgroundColor | Colors.surface, borderColor | Colors.border |
| stepRowDone | borderColor | Colors.accent + '66' (opacity suffix) |
| checkbox | borderColor | Colors.border |
| checkboxDone | backgroundColor | Colors.accent, borderColor | Colors.accent |
| checkmark | color | **Colors.surface** |
| stepLabel | color | Colors.text |
| stepLabelDone | color | Colors.text2 |
| stepProduct | color | Colors.text2 |
| changeLevelLinkText | color | Colors.text |
| hairSetupBox | backgroundColor | Colors.surface, borderColor | **rgba(230,199,156,0.5)** |
| hairSetupTitle | color | Colors.text |
| hairSetupBody | color | Colors.text2 |
| hairSetupBtn | color | Colors.accent |
| Switch | trackColor false | Colors.border, true | Colors.accent, thumbColor | Colors.text |

### app/recommendations.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| errorText | color | Colors.surface |
| linkText | color | Colors.text |
| backArrow | color | **Colors.surface** |
| title | color | Colors.text |
| subtitle | color | Colors.text2 |
| categoryCard | backgroundColor | Colors.card, borderColor | Colors.border |
| categoryTitle | color | Colors.text |
| categoryMeta | color | Colors.text2 |
| concernPill | backgroundColor | **#F5EAE4** (hardcoded light rose — no theme token) |
| concernPillText | color | Colors.accent |
| healthyPill | backgroundColor | **#EAF2EB** (hardcoded light green — no theme token) |
| healthyPillText | color | Colors.green |
| categoryChevron | color | Colors.text3 |
| categoryDivider | backgroundColor | Colors.border |
| categoryPreview | color | Colors.text2 |
| skeletonCard | backgroundColor | Colors.card, borderColor | Colors.border |
| skeletonTitle | backgroundColor | Colors.surface |
| skeletonLine | backgroundColor | Colors.surface |
| skeletonLineShort | backgroundColor | Colors.surface |

### app/skin-detail.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| backArrow | color | **Colors.surface** |
| screenTitle | color | **Colors.surface** |
| tabPill | backgroundColor | Colors.surface |
| tabPillActive | backgroundColor | Colors.accent |
| tabPillText | color | Colors.text2 |
| tabPillTextActive | color | **Colors.surface** |
| infoCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| adviceCard | backgroundColor | Colors.card, borderColor | Colors.border |
| infoCardLabel | color | Colors.accent |
| skinTypePill | backgroundColor | Colors.surface2 |
| skinTypePillText | color | Colors.text2 |
| bodyText | color | Colors.text |
| adviceText | color | Colors.text |
| concernName | color | Colors.text |
| dot | backgroundColor | Colors.border |
| dotFilled | backgroundColor | Colors.accent |
| stepRow | borderBottomColor | Colors.border2 |
| stepCircle | backgroundColor | Colors.surface |
| stepNum | color | Colors.text2 |
| stepLabel | color | Colors.text |
| stepDash | color | Colors.text3 |
| stepProduct | color | Colors.text2 |
| stepMatched | color | Colors.accent |
| stepChevron | color | Colors.accent |
| productCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| productWhy | color | Colors.text2 |
| productTagPill | backgroundColor | Colors.surface2 |
| productTagText | color | Colors.text2 |

### app/hair-detail.tsx (color-related only)
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| backArrow | color | **Colors.surface** |
| screenTitle | color | **Colors.surface** |
| tabPill | backgroundColor | Colors.surface |
| tabPillActive | backgroundColor | Colors.accent |
| tabPillTextActive | color | **Colors.surface** |
| LEVEL_COLOURS.low | — | Colors.green (?? '#7A9E7E') |
| LEVEL_COLOURS.high | — | **#E24B4A** (hardcoded red) |
| avoidCard | backgroundColor | **#FEF6F2**, borderColor | **#E8C4B4** |
| avoidName | color | **#7A4A38** |
| avoidReason | color | **#7A4A38** |
| (product card active) | borderColor | Colors.accent, backgroundColor | **rgba(230,199,156,0.12)** |
| (product list card) | backgroundColor | Colors.surface, borderColor | **rgba(230,199,156,0.4)** |
| (product dropdown) | backgroundColor | **rgba(230,199,156,0.08)**, borderColor | **rgba(230,199,156,0.4)** |
| preferredBadge | backgroundColor | **rgba(230,199,156,0.2)** |

### app/beard-detail.tsx (color-related only)
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| backArrow | color | **Colors.surface** |
| screenTitle | color | **Colors.surface** |
| honestCard | backgroundColor | **#FEF6F2**, borderColor | **#E8C4B4** |
| honestBody | color | **#7A4A38** |
| goodCard | backgroundColor | **#EAF2EB**, borderColor | **#C8DFC9** |
| goodBody | color | **#4A7A4E** |
| maintHigh | backgroundColor | **#E24B4A** (high-maintenance indicator) |
| avoidCard | backgroundColor | **#FEF6F2**, borderColor | **#E8C4B4** |
| avoidName | color | **#7A4A38** |
| avoidReason | color | **#7A4A38** |
| (product card active) | backgroundColor | **rgba(230,199,156,0.12)** |
| (product list card) | borderColor | **rgba(230,199,156,0.4)** |
| (product dropdown) | backgroundColor | **rgba(230,199,156,0.08)**, borderColor | **rgba(230,199,156,0.4)** |
| preferredBadge | backgroundColor | **rgba(230,199,156,0.2)** |

### app/makeup-detail.tsx (color-related only)
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| backArrow | color | **Colors.surface** |
| screenTitle | color | **Colors.surface** |
| noBaseCard | backgroundColor | **#EAF2EB**, borderColor | **#C8DFC9** |
| noBaseBody | color | **#4A7A4E** |
| (product card active) | backgroundColor | **rgba(230,199,156,0.12)** |
| (product list card) | borderColor | **rgba(230,199,156,0.4)** |
| (product dropdown) | backgroundColor | **rgba(230,199,156,0.08)**, borderColor | **rgba(230,199,156,0.4)** |
| preferredBadge | backgroundColor | **rgba(230,199,156,0.2)** |

### app/hair-profile.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| backArrow | color | **Colors.surface** |
| dot | backgroundColor | Colors.border |
| dotActive | backgroundColor | Colors.accent |
| dotDone | backgroundColor | Colors.accent + '60' |
| stepLabel | color | **Colors.surface** |
| question | color | **Colors.surface** |
| questionSubtitle | color | Colors.text2 |
| card | backgroundColor | Colors.surface, borderColor | Colors.border |
| cardActive | backgroundColor | Colors.surface2, borderColor | Colors.accent |
| cardLabel | color | Colors.text |
| cardLabelActive | color | Colors.accent |
| cardDesc | color | Colors.text3 |
| cardDescActive | color | Colors.accent + 'AA' |
| cardRadio | borderColor | Colors.border |
| cardRadioActive | borderColor | Colors.accent |
| cardRadioDot | backgroundColor | Colors.accent |
| cardCheckbox | borderColor | Colors.border |
| cardCheckmark | backgroundColor | Colors.accent |
| continueBtn | backgroundColor | Colors.accent |
| continueBtnText | color | Colors.card |
| savingText | color | **Colors.surface** |
| savingNote | color | Colors.text2 |
| errorText | color | **#A32D2D** (hardcoded danger) |

### app/salons/nearby.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| iconCircle | backgroundColor | Colors.surface, borderColor | Colors.border |
| iconGlyph | color | Colors.accent |
| permTitle | color | **Colors.surface** |
| permBody | color | Colors.text2 |
| primaryBtn | backgroundColor | Colors.accent |
| primaryBtnText | color | **Colors.surface** |
| ghostBtnText | color | Colors.text2 |
| cityInput | backgroundColor | Colors.surface, borderColor | Colors.border, color | Colors.text |
| loadingText | color | Colors.text2 |
| errorTitle | color | **Colors.surface** |
| errorMessage | color | Colors.text2 |
| goldButton | backgroundColor | Colors.accent |
| goldButtonText | color | **Colors.surface** |
| retryText | color | Colors.text |
| listHeader | color | Colors.text |
| listCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| listThumb | backgroundColor | Colors.surface2 |
| listThumbOverlay | backgroundColor | **rgba(0,0,0,0.2)** |
| listName | color | Colors.text |
| listAddr | color | Colors.text2 |
| listArrow | color | Colors.text3 |
| ratingText | color | Colors.accent |
| dot | color | Colors.text3 |
| reviewText | color | Colors.text2 |
| distText | color | Colors.text2 |
| openBadge | backgroundColor | **#1A3A1A** (dark green, no token) |
| closedBadge | backgroundColor | **#3A1A1A** (dark reddish, no token) |
| openBadgeText | color | **#6BCB77** (bright green, no token) |
| servicePill | backgroundColor | **rgba(230,199,156,0.18)**, borderColor | **rgba(230,199,156,0.45)** |
| servicePillText | color | Colors.accent |
| lumeProfileBadge | color | Colors.text2 |
| bb.arrow | color | **Colors.surface** |
| bb.title | color | **Colors.surface** |

### app/salons/salon-detail.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| backArrow | color | **Colors.surface** |
| salonName | color | **Colors.surface** |
| salonMeta | color | Colors.text2 |
| ratingNum | color | Colors.text |
| ratingSource | color | Colors.text2 |
| sectionLabel | color | **Colors.surface** |
| card | backgroundColor | Colors.surface, borderColor | Colors.border |
| catRowBorder | borderBottomColor | Colors.border |
| catLabel | color | Colors.text |
| catNum | color | Colors.accent |
| ratingCount | color | Colors.text3 |
| serviceGroupLabel | color | Colors.text2 |
| servicePill | backgroundColor | **rgba(230,199,156,0.18)**, borderColor | **rgba(230,199,156,0.45)** |
| servicePillText | color | Colors.accent |
| claimCard | borderColor | **rgba(230,199,156,0.5)** |
| claimTitle | color | **Colors.surface** |
| claimSub | color | Colors.text2 |
| claimBtn | backgroundColor | Colors.accent |
| claimBtnText | color | **Colors.surface** |
| bottomBar | backgroundColor | Colors.background, borderTopColor | Colors.border |
| rateBtn | backgroundColor | Colors.accent |
| rateBtnText | color | **Colors.surface** |
| dirBtn | borderColor | Colors.border, backgroundColor | Colors.surface |
| dirBtnText | color | Colors.text |
| (MiniStars) | color | Colors.accent / Colors.border |

### app/salons/salon-profile-create.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| backArrow | color | **Colors.surface** |
| stepCaption | color | Colors.text2 |
| stepTitle | color | **Colors.surface** |
| stepSub | color | Colors.text2 |
| step4Body | color | Colors.text2 |
| fieldLabel | color | **Colors.surface** |
| underlineInput | borderBottomColor | Colors.border, color | **Colors.surface** |
| phonePrefix | color | Colors.text2 |
| phoneError | color | **#E24B4A** (hardcoded error red) |
| si.line | backgroundColor | Colors.border |
| si.lineActive | backgroundColor | Colors.accent |
| pg.groupLabel | color | **Colors.surface** |
| pg.pill | backgroundColor | Colors.surface, borderColor | Colors.border |
| pg.pillActive | backgroundColor | **rgba(230,199,156,0.18)**, borderColor | **rgba(230,199,156,0.5)** |
| pg.pillText | color | Colors.text |
| pg.pillTextActive | color | Colors.accent |
| optionsCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| optionRowActive | backgroundColor | **rgba(230,199,156,0.12)** |
| radio | borderColor | Colors.border |
| radioActive | borderColor | Colors.accent |
| radioDot | backgroundColor | Colors.accent |
| optionLabel | color | Colors.text2 |
| optionLabelActive | color | Colors.text |
| optionSub | color | Colors.text3 |
| infoCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| infoText | color | Colors.text3 |
| bottomBar | backgroundColor | Colors.background, borderTopColor | Colors.border |
| nextBtn | backgroundColor | Colors.accent |
| nextBtnText | color | **Colors.surface** |
| confirmCheck | backgroundColor | **rgba(93,202,165,0.15)**, borderColor | **#5DCAA5** |
| confirmCheckText | color | **#5DCAA5** (teal success, no token) |
| confirmTitle | color | **Colors.surface** |
| confirmSub | color | Colors.text2 |
| confirmPrimaryBtn | backgroundColor | Colors.accent |
| confirmPrimaryBtnText | color | **Colors.surface** |
| confirmSecondaryBtnText | color | Colors.text2 |

### app/salons/rate-salon.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| searchInput | backgroundColor | Colors.surface, borderColor | Colors.border, color | Colors.text |
| listRow | backgroundColor | Colors.surface, borderColor | Colors.border |
| listName | color | Colors.text |
| listAddr | color | Colors.text2 |
| listArrow | color | Colors.text3 |
| addManualRow | backgroundColor | Colors.surface, borderColor | Colors.border |
| addManualText | color | Colors.accent |
| emptyHint | color | Colors.text2 |
| salonHeaderName | color | **Colors.surface** |
| salonHeaderAddr | color | Colors.text2 |
| sectionLabel | color | **Colors.surface** |
| sectionSub | color | Colors.text2 |
| overallBox | backgroundColor | Colors.surface, borderColor | Colors.border |
| pill | backgroundColor | Colors.surface, borderColor | Colors.border |
| pillActive | backgroundColor | **rgba(230,199,156,0.18)**, borderColor | **rgba(230,199,156,0.5)** |
| pillText | color | Colors.text |
| pillTextActive | color | Colors.accent |
| detailCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| detailRowBorder | borderBottomColor | Colors.border |
| detailLabel | color | Colors.text |
| submitBtn | backgroundColor | Colors.accent |
| submitBtnText | color | **Colors.surface** |
| successCheck | color | Colors.text |
| successTitle | color | **Colors.surface** |
| successBody | color | Colors.text2 |
| successBtn | backgroundColor | Colors.accent |
| successBtnText | color | **Colors.surface** |
| bb.arrow | color | **Colors.surface** |
| bb.title | color | **Colors.surface** |
| (StarsLarge/StarsSmall) | color | Colors.accent / Colors.border |

### app/salons/rate-stylist.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| searchInput | backgroundColor | Colors.surface, borderColor | Colors.border, color | Colors.text |
| listRow | backgroundColor | Colors.surface, borderColor | Colors.border |
| listName | color | Colors.text |
| listHandle | color | Colors.accent |
| listMentions | color | Colors.text2 |
| listArrow | color | Colors.text3 |
| addManualRow | backgroundColor | Colors.surface2, borderColor | Colors.border |
| addManualText | color | Colors.accent |
| emptyHint | color | Colors.text2 |
| stylistAvatar | backgroundColor | Colors.surface2, borderColor | Colors.accent |
| stylistAvatarText | color | Colors.accent |
| stylistName | color | **Colors.surface** |
| stylistHandle | color | Colors.text |
| stylistMentions | color | Colors.text2 |
| fieldLabel | color | Colors.text (note: unusual for label) |
| catCard | backgroundColor | Colors.surface, borderColor | Colors.border |
| catRowBorder | borderBottomColor | Colors.border |
| catLabel | color | Colors.text |
| pill | backgroundColor | Colors.surface, borderColor | Colors.border |
| pillActive | backgroundColor | Colors.accent, borderColor | Colors.accent |
| pillActiveNo | backgroundColor | **#3A1A1A**, borderColor | **#A32D2D** |
| pillText | color | Colors.text |
| pillTextActive | color | **Colors.surface** |
| pillTextActiveNo | color | **#FF6B6B** (bright red, no token) |
| salonRow | backgroundColor | Colors.surface, borderColor | Colors.border |
| salonRowLabel | color | Colors.text2 |
| salonRowValue | color | Colors.text |
| salonRowPlaceholder | color | Colors.text3 |
| salonRowArrow | color | Colors.text3 |
| salonInput | borderColor | Colors.accent, color | Colors.text |
| submitBtn | backgroundColor | Colors.accent |
| submitBtnText | color | **Colors.surface** |
| successCheck | color | Colors.text |
| successTitle | color | **Colors.surface** |
| successBody | color | Colors.text2 |
| successBtn | backgroundColor | Colors.accent |
| successBtnText | color | **Colors.surface** |
| bb.arrow | color | **Colors.surface** |
| bb.title | color | **Colors.surface** |

### app/profile/my-brands.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| backArrow | color | **Colors.surface** |
| screenTitle | color | **Colors.surface** |
| subtitle | color | Colors.text2 |
| sectionLabel | color | **Colors.surface** |
| pill | backgroundColor | Colors.surface, borderColor | Colors.border |
| pillSelected | backgroundColor | **rgba(230,199,156,0.18)**, borderColor | **rgba(230,199,156,0.5)** |
| pillText | color | Colors.text |
| pillTextSelected | color | Colors.accent |
| note | color | Colors.text2 |
| footer | borderTopColor | Colors.border, backgroundColor | Colors.background |
| saveBtn | backgroundColor | Colors.accent |
| saveBtnText | color | **Colors.surface** |
| refreshOverlay | backgroundColor | **rgba(28,24,22,0.88)** (near-black overlay) |
| refreshText | color | Colors.text |

### app/profile/routine-level.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| screen | backgroundColor | Colors.background |
| backArrow | color | **Colors.surface** |
| screenTitle | color | **Colors.surface** |
| subtitle | color | Colors.text2 |
| card | backgroundColor | Colors.surface, borderColor | Colors.border |
| rowLabel | color | Colors.text2 |
| rowLabelActive | color | Colors.text |
| rowSub | color | Colors.text3 |
| divider | backgroundColor | Colors.border |
| radioOuter | borderColor | Colors.text2 |
| radioOuterActive | borderColor | Colors.accent |
| radioInner | backgroundColor | Colors.accent |
| footer | borderTopColor | Colors.border, backgroundColor | Colors.background |
| saveBtn | backgroundColor | Colors.accent |
| saveBtnText | color | **Colors.surface** |

### components/ProductPickerSheet.tsx
| Style key | Property | Value |
|-----------|----------|-------|
| overlay | backgroundColor | **rgba(44, 36, 32, 0.5)** (should use Colors.text as base) |
| sheet | backgroundColor | Colors.card |
| handle | backgroundColor | Colors.border |
| title | color | Colors.text |
| reason | color | Colors.text2 |
| divider | backgroundColor | Colors.border |
| card | backgroundColor | Colors.card, borderColor | Colors.border |
| cardFeatured | backgroundColor | **#FEF6F2**, borderColor | Colors.accent |
| featuredBadge | backgroundColor | Colors.accent |
| featuredBadgeText | color | **#FFFFFF** (should be Colors.card) |
| productName | color | Colors.text |
| productBrand | color | Colors.text2 |
| productWhy | color | Colors.text2 |
| buyBtn | borderColor | Colors.accent |
| buyBtnText | color | Colors.accent |
| closeBtnText | color | Colors.text2 |

### components/ui/StarRating.tsx
| Property | Value |
|----------|-------|
| color (filled) | Colors.accent |
| color (empty) | Colors.border |

---

## 5. StatusBar + SafeAreaView audit

### StatusBar usage
All screens use `StatusBar` from `expo-status-bar`. Style is `"dark"` **everywhere** — 100% consistent. No exceptions found.

### SafeAreaView usage
`SafeAreaView` (from `react-native`) is used **only in `app/(tabs)/scan.tsx`** — in three sub-components:
- `HomeScreen` — wraps the full home layout
- `CameraScreen` — two uses: permission-denied state and wrap for processing screen
- `ProcessingScreen` — wraps the processing box

All other screens use `useSafeAreaInsets()` from `react-native-safe-area-context` and apply `paddingTop: insets.top` directly on the root View. No inconsistency within each screen, but `scan.tsx` mixes both approaches (CameraScreen uses neither — raw `View` with no top padding when camera is active, relying on the camera filling the full screen).

---

## 6. Screen-by-screen summary

| Screen | Uses theme tokens | Hardcoded colors found |
|--------|------------------|----------------------|
| app/index.tsx | N/A (redirect) | None |
| app/_layout.tsx | Colors | None |
| app/(auth)/_layout.tsx | Colors | None |
| app/(auth)/splash.tsx | Colors, Typography, Spacing | None |
| app/(auth)/login.tsx | Colors, Typography, Spacing, Radius | #FFFFFF (Google btn bg), #4285F4 (Google icon), #1C1816 (Google text) |
| app/(auth)/signup.tsx | Colors, Typography, Spacing, Radius | Same 3 as login.tsx |
| app/(auth)/otp.tsx | Colors, Typography, Spacing, Radius | None |
| app/(auth)/onboarding.tsx | Colors, Typography, Spacing, Radius | None |
| app/(tabs)/_layout.tsx | Colors | None |
| app/(tabs)/scan.tsx | Colors, Typography, Spacing, Radius | #6B8CAE, #3A6B3A, #444, #333 (SVG attrs), rgba(0,0,0,0.55), rgba(255,255,255,x), rgba(10,10,10,0.6), #FFFFFF (capture btn), #A32D2D (error), #1A2A1A (pill bg), #5A9A5A (pill text) |
| app/(tabs)/discover.tsx | Colors, Typography, Spacing, Radius | None |
| app/(tabs)/profile.tsx | Colors, Typography, Spacing, Radius | #A32D2D (delete text) |
| app/(tabs)/routine.tsx | Colors, Typography, Spacing, Radius | rgba(230,199,156,0.5) (hair setup border) |
| app/recommendations.tsx | Colors, Typography, Spacing | #F5EAE4 (concern pill bg), #EAF2EB (healthy pill bg) |
| app/skin-detail.tsx | Colors, Typography, Spacing, Radius | None |
| app/hair-detail.tsx | Colors, Typography, Spacing, Radius | #E24B4A (maintenance high), #FEF6F2+#E8C4B4+#7A4A38 (avoid cards), rgba(230,199,156,x) × 4 (product cards) |
| app/beard-detail.tsx | Colors, Typography, Spacing, Radius | #FEF6F2+#E8C4B4+#7A4A38 (honest/avoid cards), #EAF2EB+#C8DFC9+#4A7A4E (good card), #E24B4A (maint high), rgba(230,199,156,x) × 4 |
| app/makeup-detail.tsx | Colors, Typography, Spacing, Radius | #EAF2EB+#C8DFC9+#4A7A4E (noBase card), rgba(230,199,156,x) × 4 |
| app/hair-profile.tsx | Colors, Typography, Spacing, Radius | #A32D2D (error text) |
| app/salons/_layout.tsx | Colors | None |
| app/salons/nearby.tsx | Colors, Typography, Spacing, Radius | rgba(0,0,0,0.2) (thumb overlay), #1A3A1A+#3A1A1A+#6BCB77 (open/closed badges), rgba(230,199,156,x) (service pills) |
| app/salons/salon-detail.tsx | Colors, Typography, Spacing, Radius | rgba(230,199,156,x) × 3 (service pills, claim card border) |
| app/salons/salon-profile-create.tsx | Colors, Typography, Spacing (missing Radius) | rgba(230,199,156,x) × 3, #E24B4A (phone error), rgba(93,202,165,0.15)+#5DCAA5 (success) |
| app/salons/rate-salon.tsx | Colors, Typography, Spacing, Radius | rgba(230,199,156,x) (active pills) |
| app/salons/rate-stylist.tsx | Colors, Typography, Spacing, Radius | #3A1A1A+#A32D2D+#FF6B6B (No pill) |
| app/profile/my-brands.tsx | Colors, Typography, Spacing, Radius | rgba(230,199,156,x) (selected pills), rgba(28,24,22,0.88) (overlay) |
| app/profile/routine-level.tsx | Colors, Typography, Spacing, Radius | None |
| components/ProductPickerSheet.tsx | Colors | rgba(44,36,32,0.5) (overlay), #FEF6F2 (featured card bg), #FFFFFF (badge text) |
| components/ui/StarRating.tsx | Colors | None |

---

## Key findings summary (for reference when fixing)

### Pattern 1: `Colors.surface` used as text on `Colors.background`
`Colors.surface = #EDE6DC` on `Colors.background = #F7F4EF` = ~1.3:1 contrast ratio (WCAG fail).
Used for: all titles, headings, back arrows, section labels, screen titles across almost every screen.
Files affected: login, signup, otp, onboarding, scan, discover, profile, routine, hair-profile, nearby, salon-detail, salon-profile-create, rate-salon, rate-stylist, my-brands, routine-level, recommendations (backArrow), skin-detail (backArrow+screenTitle), hair-detail, beard-detail, makeup-detail, hair-profile — and the BackBar sub-components.

### Pattern 2: `rgba(230,199,156,x)` — gold tint from a non-theme color
`#E6C79C` (the rgb base) is not `Colors.accent (#C17B5C)`. It's a legacy warm gold used for selected/active pill states and product card highlights across:
- routine.tsx (hairSetupBox border)
- hair-detail.tsx, beard-detail.tsx, makeup-detail.tsx (product cards × 4 each)
- nearby.tsx, salon-detail.tsx, salon-profile-create.tsx, rate-salon.tsx, my-brands.tsx (active pills)

### Pattern 3: Semantic color inconsistencies
- `Colors.card` exists but `#FFFFFF` is hardcoded in login.tsx, signup.tsx, scan.tsx (capture btn), ProductPickerSheet.tsx (badge text).
- `Colors.green` exists but `#EAF2EB`, `#C8DFC9`, `#4A7A4E`, `#5A9A5A`, `#6BCB77`, `#3A6B3A` are all used for green semantic states (healthy, good, open) — no theme tokens for these shades.
- No danger/error token in theme — `#A32D2D`, `#E24B4A`, `#FF6B6B` all hardcoded.
- No success token — `#5DCAA5` hardcoded in salon-profile-create.
- No open/closed badge tokens — `#1A3A1A`, `#3A1A1A`, `#6BCB77` in nearby.tsx.

### Pattern 4: `Colors.surface` used for CTA text on accent buttons
`Colors.surface (#EDE6DC)` on `Colors.accent (#C17B5C)` — this is used universally for button text. Contrast is approximately 2.5:1, below WCAG AA (4.5:1 for normal text). `Colors.card (#FFFFFF)` would give ~4.1:1 on the accent background — closer but still borderline. `Colors.text (#2C2420)` would give ~4.9:1.
