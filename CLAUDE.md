# Lumé

AI-powered personal care app for Indian users. Covers skin, hair, beard, and makeup — gender-aware: men see skin/hair/beard sections; women see skin/hair/makeup. Users take a face scan, AI analyzes and generates a personalized care plan, users track adherence daily, and every 4 weeks rescan to see measurable progress. Retention is built on the scan-delta moment.

## Product principles

- Editorial voice, not clinical. Lumé reads like a thoughtful print magazine, not a medical dashboard.
- The word "prescription" is banned in UI. Use "care plan."
- Revenue is affiliate-only (Amazon India, Nykaa). No brand partnerships. The moat is longitudinal outcome data.
- Lumé prescribes a primary product per step with clinical reasoning tied to the user's scan. Alternatives are secondary.
- Never flatter. Always honest. When uncertain or something looks serious, suggest a dermatologist consult.

## Design system

- Palette: Cream & Terracotta. bg #f4ecdf, ink #241810, accent #b8532f. Dark scan screens use scanBg #1c130c.
- Typography: Cormorant Garamond (display serif, italic for emphasis) + Inter (body, UI labels). Loaded via expo-font + @expo-google-fonts.
- Aesthetic: thin horizontal rules between sections, small-caps chapter labels, italic emphasis in display titles, generous whitespace.
- Tokens live in constants/theme.ts as Palette and Type (plus Space, Radius). These are the only design tokens — no legacy Colors/Typography/Spacing exports exist.

## Stack

- React Native + Expo (managed). TypeScript strict. Expo Router file-based routing.
- Supabase (auth, Postgres with RLS, JSONB-heavy schema).
- Gemini 2.5 Pro (vision) + Gemini 2.5 Flash (recommendations).
- Cloudflare R2 for image storage.

## Architecture

- lib/ — pure logic and clients. habit.ts (streaks, adherence), milestones.ts (6 outcome-linked moments), gemini.ts (vision + recs prompts), hair.ts, traits.ts, supabase.ts, storage.ts.
- services/ — Supabase-integrated flows. scanService, deltaService, habitService, kitService, notificationService.
- hooks/useScan.ts — scan flow state.
- constants/products.json — 100-product catalog. constants/productConstants.ts — scoring algorithm and category mapping.

## Implementation status

Phase 0 complete: frontend cleared, design tokens landed, minimal boot infrastructure in place. Phases 1-9 rebuild screens against the finished editorial design. Gemini prompts will be rewritten between Phase 2 and Phase 3.

## Working name

Lumé is the working name. A rename to Kyn is pending trademark verification. Do NOT rename anywhere in code. Founder handles the rename after all design work lands.
