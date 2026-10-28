import { render } from '@testing-library/react-native';
import { colors } from '../../../theme/tokens';
import { LowerFlourish } from './VenueArt';

jest.mock('react-native-svg', () =>
  jest.requireActual('../../../../test-support/svg'),
);

it('renders the lower flourish as a scaled SVG stroke instead of a PNG', async () => {
  const screen = await render(<LowerFlourish scale={1.2} />);
  const svg = screen.getByTestId('challenge-lower-flourish', {
    includeHiddenElements: true,
  });
  const strokes = screen.container.queryAll((node) => node.type === 'Path');

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
  expect(
    screen.container.queryAll((node) => node.type === 'Image'),
  ).toHaveLength(0);
});
