jest.mock('react-native-svg', () =>
  jest.requireActual('../../test-support/svg'),
);
import { render } from '@testing-library/react-native';
import { NavigationIcon } from './NavigationIcon';

it('fills the selected Progress bars and outlines them when inactive', async () => {
  const screen = await render(
    <NavigationIcon name="progress" color="#fff" active />,
  );
  expect(screen.root).toHaveProp('width', 24);
  expect(screen.root).toHaveProp('height', 24);
  const home = await render(<NavigationIcon name="home" color="#fff" />);
  expect(home.root).toHaveProp('width', 28);
  expect(
    screen.container
      .queryAll((node) => node.type === 'Rect')
      .map((bar) => bar.props.fill),
  ).toEqual(['#fff', '#fff', '#fff']);
  await screen.rerender(<NavigationIcon name="progress" color="#fff" />);
  expect(
    screen.container
      .queryAll((node) => node.type === 'Rect')
      .map((bar) => bar.props.fill),
  ).toEqual(['none', 'none', 'none']);
});
