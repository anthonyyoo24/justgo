import { Platform } from 'react-native';
import { fontFamilies } from '../../theme/tokens';
// Measured component rules and explicit raster reconstructions: docs/design/CHALLENGE_FIDELITY.md.
// Raster lettering has no editable face metadata. Use the high-contrast serif
// available in the Paper file; the editable timer keeps its verified Baskerville.
export const challengeDisplayFont = Platform.select({
  ios: 'Bodoni 72',
  web: "'Bodoni 72', Didot, 'Times New Roman', serif",
  default: fontFamilies.display,
});
export const challengeScale = (width: number) => Math.min(width / 320, 1.2);
export const timerOutline =
  'M23 4C58 3 117 0 149 2C172 3 179 14 179 34L178 60C177 79 166 83 149 84C109 87 56 85 23 82C7 80 1 73 1 60L2 22C3 10 9 5 23 4Z';
// The source peach panel is raster artwork. Preserve its gently uneven silhouette
// with one stable contour, rather than a rounded rectangle or randomized corners.
export const panelOutline =
  'M27 2C66 0 110 3 153 2C177 1 186 10 187 30L186 73C186 94 180 104 157 104C111 106 67 103 29 105C9 106 2 95 1 74L2 31C2 12 10 3 27 2Z';
