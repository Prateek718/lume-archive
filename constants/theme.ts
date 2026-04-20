// Lumé design system — single source of truth for all colours, spacing, and shapes.
// Import from here in every screen and component — never hardcode values.

export const Colors = {
  background: '#F7F4EF',
  surface:    '#EDE6DC',
  surface2:   '#E2D9CC',
  card:       '#FFFFFF',
  text:       '#2C2420',
  text2:      '#8A7E76',
  text3:      '#B0A49A',
  accent:     '#C17B5C',
  green:      '#7A9E7E',
  border:     '#D8CFC4',
  border2:    '#EAE3DA',

  tabBar:     '#FFFFFF',
  tabActive:  '#C17B5C',
  tabInactive:'#B0A49A',

  // Text/icons on accent backgrounds (CTAs, active pills, checkmarks)
  textOnAccent:  '#FFFFFF',

  // Semantic — danger / errors
  danger:        '#A32D2D',           // primary danger (delete, errors)
  dangerStrong:  '#E24B4A',           // stronger warning red
  dangerBg:      '#FEF6F2',           // light danger background
  dangerBorder:  '#E8C4B4',           // danger border
  dangerText:    '#7A4A38',           // text on danger backgrounds

  // Semantic — success
  successText:   '#4A7A4E',           // text for success/healthy
  successBg:     '#EAF2EB',           // success background
  successBorder: '#C8DFC9',           // success border

  // Accent variants (pills, light highlights)
  accentBg:         '#F5EAE4',                  // light accent background (concern pill)
  accentTint:       'rgba(230,199,156,0.12)',   // lightest gold tint
  accentTintMedium: 'rgba(230,199,156,0.18)',   // active pill bg
  accentTintBorder: 'rgba(230,199,156,0.45)',   // active pill border

  // Accent tint variants (continued)
  accentTintStrong:       'rgba(230,199,156,0.2)',   // preferred badge bg
  accentTintLight:        'rgba(230,199,156,0.08)',  // lightest gold bg
  accentTintBorderStrong: 'rgba(230,199,156,0.5)',   // stronger gold border

  // Danger (light variant — for high-contrast text on dark backgrounds)
  dangerLight:   '#FF6B6B',

  // Success — pill variant (dark bg, light text)
  successPillBg:   '#1A2A1A',
  successPillText: '#5A9A5A',

  // Open/closed status badges (salons)
  statusOpenBg:    '#1A3A1A',
  statusOpenText:  '#6BCB77',
  statusClosedBg:  '#3A1A1A',

  // Overlays
  overlayLight:  'rgba(0,0,0,0.2)',       // thumbnail overlay
  overlayMedium: 'rgba(0,0,0,0.55)',      // camera overlay
  overlayDark:   'rgba(28,24,22,0.88)',   // refresh overlay
  overlaySheet:  'rgba(44,36,32,0.5)',    // bottom sheet backdrop
} as const;

export const Typography = {
  // Font families
  serif:          'Georgia',       // titles and display text
  sans:           undefined,       // system default sans-serif

  // Font sizes
  size: {
    xs:     10,
    sm:     11,
    base:   13,
    md:     14,
    lg:     16,
    xl:     20,
    xxl:    24,
    xxxl:   32,
  },

  // Letter spacing
  letterSpacing: {
    label: 0.06, // uppercase labels — Gold colour, spaced out
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
  card:   12,  // cards
  input:  10,  // text inputs and buttons
  pill:   999, // pill-shaped tags and chips
  icon:   10,  // icon containers
} as const;
