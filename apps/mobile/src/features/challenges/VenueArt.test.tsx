import { render } from '@testing-library/react-native';
import { Image } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme/tokens';
import { LowerFlourish } from './VenueArt';

it('renders the lower flourish as a scaled SVG stroke instead of a PNG', () => {
  const screen = render(<LowerFlourish scale={1.2} />);
  const svg = screen.UNSAFE_getByType(Svg);
  const strokes = screen.UNSAFE_getAllByType(Path);

  expect(svg.props.viewBox).toBe('0 0 352 108');
  expect(svg.props['aria-hidden']).toBe(true);
  expect(svg.props.accessible).toBeUndefined();
  expect(svg.props.width).toBeCloseTo(105.6);
  expect(svg.props.height).toBeCloseTo(32.4);
  expect(strokes).toHaveLength(2);
  for (const stroke of strokes) {
    expect(stroke.props.d).toMatch(/^M10 38 C/);
    expect(stroke.props.d).toMatch(/331 83$/);
    expect(stroke.props.fill).toBe('none');
    expect(stroke.props.stroke).toBe(colors.ink);
  }
  expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
});
