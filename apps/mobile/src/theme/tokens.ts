import { Platform, type TextStyle } from 'react-native';

/** Source: approved Paper Version 3 row. See docs/DESIGN.md for measurements and gaps. */
export const colors = {
  ink: '#102C49',
  navy: '#142F46',
  navyBorder: '#0D2539',
  cream: '#F8F0E9',
  paper: '#FCF9F3',
  white: '#FFFFFF',
  peach: '#FCE1CB',
  border: '#B7B2AC',
  feelingInk: '#12395C',
  feelingMuchLess: '#C794A7',
  feelingLess: '#F5C7AE',
  feelingMore: '#BBE1D1',
  feelingMuchMore: '#92CDAF',
} as const;

export const fontFamilies = {
  display: Platform.select({
    ios: 'Baskerville',
    web: 'Baskerville, Georgia, serif',
    default: 'serif',
  }),
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

// Body/button sizes enlarged from the 320px reference for readable native controls.
export const typography = {
  display: {
    fontFamily: fontFamilies.display,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.72,
  },
  heading: {
    fontFamily: fontFamilies.display,
    fontSize: 29,
    lineHeight: 32,
    letterSpacing: -0.725,
  },
  timer: { fontFamily: fontFamilies.display, fontSize: 50, lineHeight: 52 },
  body: { fontFamily: fontFamilies.regular, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fontFamilies.medium, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: fontFamilies.regular, fontSize: 12, lineHeight: 18 },
} as const satisfies Record<string, TextStyle>;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  screen: 28,
  xxl: 32,
  section: 48,
} as const;
export const radii = {
  small: 4,
  card: 20,
  circleControl: 22,
  pill: 999,
} as const;
export const layout = {
  minTouchTarget: 44,
  buttonHeight: 48,
  maxContentWidth: 420,
} as const;
export const theme = {
  colors,
  fontFamilies,
  typography,
  spacing,
  radii,
  layout,
} as const;
