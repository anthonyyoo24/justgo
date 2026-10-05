import { render } from '@testing-library/react-native';

const mockPreviewModuleLoaded = jest.fn();
const mockPreviewRendered = jest.fn();
jest.mock('../dev/previews/ScreenPreview', () => {
  mockPreviewModuleLoaded();
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    ScreenPreview: (props: unknown) => {
      mockPreviewRendered(props);
      return <Text>Development preview</Text>;
    },
  };
});
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
    useLocalSearchParams: () => ({
      simulateSkipFailure: '1',
      progressState: 'loading',
      progressDayState: 'initial-error',
    }),
  };
});

// Do not import the preview fixture here: the route must own its guarded loading.
const PreviewRoute = require('../app/preview')
  .default as typeof import('../app/preview').default;
const development = globalThis as typeof globalThis & { __DEV__: boolean };
const initialDevelopment = development.__DEV__;
afterEach(() => {
  development.__DEV__ = initialDevelopment;
});

it('does not load developer fixtures in production and preserves the development route', () => {
  development.__DEV__ = false;
  const screen = render(<PreviewRoute />);
  expect(screen.getByText('Redirect: /')).toBeTruthy();
  expect(mockPreviewModuleLoaded).not.toHaveBeenCalled();
  expect(mockPreviewRendered).not.toHaveBeenCalled();

  development.__DEV__ = true;
  screen.rerender(<PreviewRoute />);
  expect(screen.getByText('Development preview')).toBeTruthy();
  expect(mockPreviewModuleLoaded).toHaveBeenCalledTimes(1);
  expect(mockPreviewRendered).toHaveBeenLastCalledWith({
    simulateSkipFailure: true,
    progressState: 'loading',
    progressDayState: 'initial-error',
  });

  development.__DEV__ = false;
  screen.rerender(<PreviewRoute />);
  expect(screen.getByText('Redirect: /')).toBeTruthy();
  expect(screen.queryByText('Development preview')).toBeNull();
  expect(mockPreviewRendered).toHaveBeenCalledTimes(1);
});
