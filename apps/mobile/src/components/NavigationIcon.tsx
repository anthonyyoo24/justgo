import type { ColorValue } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
export function NavigationIcon({
  name,
  color,
  active = false,
}: {
  name: 'home' | 'progress';
  color: ColorValue;
  active?: boolean;
}) {
  return (
    <Svg
      width={name === 'home' ? 28 : 24}
      height={name === 'home' ? 28 : 24}
      viewBox="0 0 24 24"
      aria-hidden={true}
    >
      {name === 'home' ? (
        <>
          <Path
            d="M9 3.3L17.9 5.2C19 5.4 19.6 6.3 19.4 7.4L17.6 15.7"
            fill="none"
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Rect
            x={4}
            y={6.4}
            width={11.6}
            height={14.1}
            rx={1.8}
            fill="none"
            stroke={color}
            strokeWidth={1.4}
          />
          <Path
            d="M7.2 13.3L9.3 15.3L12.7 11.7"
            fill="none"
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <Rect
            x={2.5}
            y={14}
            width={4.2}
            height={7.5}
            rx={0.8}
            fill={active ? color : 'none'}
            stroke={color}
            strokeWidth={1.2}
          />
          <Rect
            x={9.9}
            y={9}
            width={4.2}
            height={12.5}
            rx={0.8}
            fill={active ? color : 'none'}
            stroke={color}
            strokeWidth={1.2}
          />
          <Rect
            x={17.3}
            y={3}
            width={4.2}
            height={18.5}
            rx={0.8}
            fill={active ? color : 'none'}
            stroke={color}
            strokeWidth={1.2}
          />
        </>
      )}
    </Svg>
  );
}
