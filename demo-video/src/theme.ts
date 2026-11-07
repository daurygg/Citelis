import { loadFont } from '@remotion/google-fonts/BricolageGrotesque';

// Brand font of the app (Bricolage Grotesque). Loaded from Google Fonts at render time.
const { fontFamily } = loadFont('normal', {
  weights: ['400', '600', '700', '800'],
  subsets: ['latin', 'latin-ext'],
});

// Citelis brand values (from the app's tailwind/CSS tokens).
export const theme = {
  paper: '#fff5f6',
  paperDeep: '#ffe4e8',
  ink: '#231f26',
  muted: '#6d6772',
  line: '#e6e1e8',
  primary: '#e11d48',
  brand600: '#be123c',
  brand700: '#9f1239',
  white: '#ffffff',
  fontHeading: fontFamily,
  fontBody: fontFamily,
} as const;
