import type { ColorValue } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
export function NavigationIcon({
  name,
  color,
}: {
  name: 'home' | 'progress';
  color: ColorValue;
}) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" aria-hidden={true}>
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
        <Path
          d="M3.2 14.5H6.8V20.5H3.2V14.5ZM10.2 9.3H13.8V20.5H10.2V9.3ZM17.2 3.5H20.8V20.5H17.2V3.5Z"
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}
