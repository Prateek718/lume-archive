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
