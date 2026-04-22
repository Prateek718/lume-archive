// Lumé editorial design tokens.
// Palette: Cream & Terracotta (morning cream with warm earth terracotta,
// Indian editorial aesthetic). Typography: Cormorant Garamond (display
// serif with italic emphasis) + Inter (body, UI labels).

export const Palette = {
  bg: '#f4ecdf',
  bgElev: '#fbf5e9',
  bgDeep: '#e7dbc4',
  ink: '#241810',
  ink2: '#4a392a',
  ink3: '#856e56',
  ink4: '#b6a184',
  rule: '#ddcba8',
  accent: '#b8532f',
  accentSoft: '#f0dcc9',
  scanBg: '#1c130c',
  improved: '#5a7a4f',
  improvedSoft: '#dce4d2',
  onScanBg: '#f3efe6',
  danger: '#a03829',
  dangerSoft: '#f0d8d2',
} as const;

export const Type = {
  display:       { fontFamily: 'CormorantGaramond_500Medium', fontSize: 36, lineHeight: 39, letterSpacing: -0.3 },
  displayLarge:  { fontFamily: 'CormorantGaramond_500Medium', fontSize: 52, lineHeight: 53, letterSpacing: -1.5 },
  displaySmall:  { fontFamily: 'CormorantGaramond_500Medium', fontSize: 28, lineHeight: 31, letterSpacing: -0.3 },
  displayItalic: { fontFamily: 'CormorantGaramond_500Medium_Italic', fontStyle: 'italic' as const, fontSize: 36, lineHeight: 39, letterSpacing: -0.3 },
  body:          { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22 },
  bodySerif:     { fontFamily: 'CormorantGaramond_400Regular', fontSize: 14, lineHeight: 22 },
  chapterLabel:  { fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 2.6, textTransform: 'uppercase' as const },
  button:        { fontFamily: 'Inter_500Medium', fontSize: 14, letterSpacing: 0.3 },
} as const;

export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const Radius = { sm: 4, md: 8, lg: 12, xl: 16, pill: 999 } as const;
