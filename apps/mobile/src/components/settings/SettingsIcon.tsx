import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { ProviderLogo } from '../auth/ProviderLogo';
import { colors } from '../../theme/tokens';

export type SettingsIconName =
  | 'back'
  | 'chevron'
  | 'haptics'
  | 'motion'
  | 'account'
  | 'subscription'
  | 'export'
  | 'import'
  | 'icloud'
  | 'apple'
  | 'google'
  | 'logout'
  | 'delete'
  | 'analytics'
  | 'sensitive'
  | 'help'
  | 'idea'
  | 'rate'
  | 'instagram'
  | 'tiktok'
  | 'twitter'
  | 'privacy'
  | 'terms'
  | 'key'
  | 'transfer'
  | 'devices';

// Native outline icons reconstructed for the raster F1 reference's visual style.
// They are decorative; each row supplies its own accessible name.
export function SettingsIcon({ name }: { name: SettingsIconName }) {
  if (name === 'apple' || name === 'google')
    return <ProviderLogo provider={name} />;
  const paths: Record<Exclude<SettingsIconName, 'apple' | 'google'>, string> = {
    back: 'M15 5L8 12L15 19',
    chevron: 'M9 7L14 12L9 17',
    haptics:
      'M4 5L2 7L4 9L2 12L4 15L2 17L4 19M20 5L22 7L20 9L22 12L20 15L22 17L20 19M10 18H14',
    motion: 'M7 12H17',
    account: 'M4 21V19C4 15 20 15 20 19V21',
    subscription: 'M3 9H21M14 15H18',
    export: 'M12 3V16M6 10L12 16L18 10M4 21H20',
    import: 'M12 16V3M6 9L12 3L18 9M4 21H20',
    icloud:
      'M21 7A9 9 0 0 0 4 7L3 10M1 7L3 10L6 8M8 21H18A4 4 0 0 0 18 13A5 5 0 0 0 8 14A3.5 3.5 0 0 0 8 21Z',
    logout: 'M10 4H4V20H10M9 12H21M16 7L21 12L16 17',
    delete: 'M3 6H21M8 6V3H16V6M6 6L7 21H17L18 6M10 10V17M14 10V17',
    analytics: 'M4 20V13M12 20V8M20 20V3',
    sensitive:
      'M12 3L20 7V12C20 17 16 20 12 22C8 20 4 17 4 12V7L12 3ZM8 12L11 15L16 9',
    help: 'M9 9C9 5 16 5 16 9C16 12 12 11 12 15M12 18V18.1',
    idea: 'M9 18H15M10 21H14M8 15C3 10 6 3 12 3C18 3 21 10 16 15L15 18H9L8 15Z',
    rate: 'M12 3L14.8 8.7L21 9.6L16.5 14L17.6 20.2L12 17.3L6.4 20.2L7.5 14L3 9.6L9.2 8.7Z',
    instagram:
      'M8 3H16A5 5 0 0 1 21 8V16A5 5 0 0 1 16 21H8A5 5 0 0 1 3 16V8A5 5 0 0 1 8 3ZM16 12A4 4 0 1 1 8 12A4 4 0 1 1 16 12ZM17 7H17.1',
    tiktok: 'M14 3V16A5 5 0 1 1 10 11M14 3C15 7 18 8 21 8',
    twitter: 'M5 4H9L19 20H15ZM19 4L5 20',
    privacy:
      'M12 3L20 7V12C20 17 16 20 12 22C8 20 4 17 4 12V7L12 3ZM12 10V14M12 17V17.1',
    terms: 'M8 7H16M8 11H16M8 15H13',
    key: 'M14 10L21 3M18 6L21 9M16 8L19 11M15 15A6 6 0 1 1 3 15A6 6 0 1 1 15 15Z',
    transfer: 'M3 7H20M16 3L20 7L16 11M21 17H4M8 13L4 17L8 21',
    devices: 'M7 3H17V21H7ZM11 18H13',
  };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
      {(name === 'motion' || name === 'help') && (
        <Circle
          cx={12}
          cy={12}
          r={9}
          stroke={colors.ink}
          strokeWidth={1.4}
          fill="none"
        />
      )}
      {name === 'account' && (
        <Circle
          cx={12}
          cy={7}
          r={4}
          stroke={colors.ink}
          strokeWidth={1.4}
          fill="none"
        />
      )}
      {name === 'subscription' && (
        <Rect
          x={3}
          y={4}
          width={18}
          height={16}
          rx={2}
          stroke={colors.ink}
          strokeWidth={1.4}
          fill="none"
        />
      )}
      {(name === 'haptics' || name === 'terms') && (
        <Rect
          x={name === 'haptics' ? 7 : 5}
          y={3}
          width={name === 'haptics' ? 10 : 14}
          height={18}
          rx={2}
          stroke={colors.ink}
          strokeWidth={1.4}
          fill="none"
        />
      )}
      <Path
        d={paths[name]}
        fill="none"
        stroke={colors.ink}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
