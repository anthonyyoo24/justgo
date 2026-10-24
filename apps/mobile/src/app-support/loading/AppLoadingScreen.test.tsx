jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
import { render } from '@testing-library/react-native';
import { AppLoadingScreen } from './AppLoadingScreen';
import { colors } from '../../theme/tokens';

it('shows only the static brand mark on cream with an accessible loading state', async () => {
  const screen = await render(<AppLoadingScreen />);
  const loading = screen.getByRole('progressbar', {
    name: 'Loading JustGO',
  });
  expect(loading.props.accessibilityState.busy).toBe(true);
  expect(loading).toHaveStyle({ backgroundColor: colors.cream });
  const mark = screen.container.queryAll(
    (node) => node.type === 'ExpoImage',
  )[0]!;
  expect(mark.props.source).toBe(
    require('../../../assets/brand/justgo-mark.png'),
  );
  expect(mark.props.transition).toBe(0);
  expect(mark.props.contentFit).toBe('contain');
  expect(mark.props.accessible).toBe(false);
  expect(
    screen.container.queryAll((node) =>
      node.type.includes('ActivityIndicator'),
    ),
  ).toHaveLength(0);
  expect(screen.queryByText(/JustGO/i)).toBeNull();
});

it('announces the current loading job without adding visible copy', async () => {
  const screen = await render(<AppLoadingScreen label="Loading saved data" />);
  expect(
    screen.getByRole('progressbar', { name: 'Loading saved data' }),
  ).toBeTruthy();
  expect(screen.queryByText('Loading saved data')).toBeNull();
});
