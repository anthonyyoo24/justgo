import { render } from '@testing-library/react-native';
import Svg, { Rect } from 'react-native-svg';
import { NavigationIcon } from './NavigationIcon';

it('fills the selected Progress bars and outlines them when inactive', () => {
  const screen = render(<NavigationIcon name="progress" color="#fff" active />);
  expect(screen.UNSAFE_getByType(Svg).props.width).toBe(24);
  expect(screen.UNSAFE_getByType(Svg).props.height).toBe(24);
  const home = render(<NavigationIcon name="home" color="#fff" />);
  expect(home.UNSAFE_getByType(Svg).props.width).toBe(28);
  expect(screen.UNSAFE_getAllByType(Rect).map((bar) => bar.props.fill)).toEqual(
    ['#fff', '#fff', '#fff'],
  );
  screen.rerender(<NavigationIcon name="progress" color="#fff" />);
  expect(screen.UNSAFE_getAllByType(Rect).map((bar) => bar.props.fill)).toEqual(
    ['none', 'none', 'none'],
  );
});
