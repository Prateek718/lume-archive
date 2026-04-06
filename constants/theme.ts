// Lumé design system — single source of truth for all colours, spacing, and shapes.
// Import from here in every screen and component — never hardcode values.

export const Colors = {
  // Backgrounds
  background:     '#0A0A0A', // near-black — used on every screen
  surface:        '#1A1412', // warm dark — cards, inputs
  surface2:       '#2A2A2A', // slightly lighter — nested elements inside cards

  // Brand
  gold:           '#C9A84C', // primary accent — buttons, active tabs, highlights
  goldDim:        '#2A2010', // gold-tinted background — used behind badges

  // Text
  cream:          '#F5F0E8', // primary text on dark backgrounds
  textSecondary:  '#888888', // secondary / supporting text
  textTertiary:   '#555555', // placeholder text inside inputs

  // Borders
  border:         '#333333', // card borders
  borderSubtle:   '#222222', // dividers between sections

  // State
  danger:         '#A32D2D', // destructive actions only (delete, remove)

  // Tab bar
  tabBar:         '#111111', // tab bar background
  tabActive:      '#C9A84C', // active tab icon and label
  tabInactive:    '#444444', // inactive tab icon and label
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
