import { render } from '@testing-library/react-native';

const mockPreviewModuleLoaded = jest.fn();
const mockPreviewRendered = jest.fn();
const mockHapticsLoaded = jest.fn();
const mockWelcomeLoaded = jest.fn();
const mockWelcomeRendered = jest.fn();
const mockPreviewParams = {
  mode: '',
  progressState: 'loading',
  progressDayState: 'initial-error',
  state: '',
};
jest.mock('../dev/previews/WelcomePreview', () => {
  mockWelcomeLoaded();
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    WelcomePreview: (props: unknown) => {
      mockWelcomeRendered(props);
      return <Text>Welcome preview</Text>;
    },
  };
});
jest.mock('../dev/haptics/HapticsTestScreen', () => {
  mockHapticsLoaded();
  const { Text } = require('react-native') as typeof import('react-native');
  return { HapticsTestScreen: () => <Text>Haptics testing</Text> };
});
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
    useLocalSearchParams: () => mockPreviewParams,
  };
});

// Do not import the preview fixture here: the route must own its guarded loading.
const PreviewRoute = require('../app/preview')
  .default as typeof import('../app/preview').default;
const development = globalThis as typeof globalThis & { __DEV__: boolean };
const initialDevelopment = development.__DEV__;
afterEach(() => {
  development.__DEV__ = initialDevelopment;
  mockPreviewParams.mode = '';
  mockPreviewParams.progressDayState = 'initial-error';
  mockPreviewParams.progressState = 'loading';
  mockPreviewParams.state = '';
});

it('guards the isolated welcome preview and passes presentation state without account creation', () => {
  mockPreviewParams.mode = 'welcome';
  mockPreviewParams.state = 'loading';
  development.__DEV__ = false;
  const screen = render(<PreviewRoute />);
  expect(screen.getByText('Redirect: /')).toBeTruthy();
  expect(mockWelcomeLoaded).not.toHaveBeenCalled();
  development.__DEV__ = true;
  screen.rerender(<PreviewRoute />);
  expect(screen.getByText('Welcome preview')).toBeTruthy();
  expect(mockWelcomeRendered).toHaveBeenLastCalledWith({ state: 'loading' });
  mockPreviewParams.state = 'error';
  screen.rerender(<PreviewRoute />);
  expect(mockWelcomeRendered).toHaveBeenLastCalledWith({ state: 'error' });
});

it('loads the haptics screen only through the development guard', () => {
  mockPreviewParams.mode = 'haptics';
  development.__DEV__ = false;
  const screen = render(<PreviewRoute />);
  expect(screen.getByText('Redirect: /')).toBeTruthy();
  expect(mockHapticsLoaded).not.toHaveBeenCalled();
  development.__DEV__ = true;
  screen.rerender(<PreviewRoute />);
  expect(screen.getByText('Haptics testing')).toBeTruthy();
  expect(mockHapticsLoaded).toHaveBeenCalledTimes(1);
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
    progressState: 'loading',
    progressDayState: 'initial-error',
  });

  mockPreviewParams.progressDayState = 'offline';
  screen.rerender(<PreviewRoute />);
  expect(mockPreviewRendered).toHaveBeenLastCalledWith({
    progressState: 'loading',
    progressDayState: 'offline',
  });

  mockPreviewParams.progressState = 'syncing';
  screen.rerender(<PreviewRoute />);
  expect(mockPreviewRendered).toHaveBeenLastCalledWith({
    progressState: 'syncing',
    progressDayState: 'offline',
  });

  development.__DEV__ = false;
  screen.rerender(<PreviewRoute />);
  expect(screen.getByText('Redirect: /')).toBeTruthy();
  expect(screen.queryByText('Development preview')).toBeNull();
  expect(mockPreviewModuleLoaded).toHaveBeenCalledTimes(1);
  expect(mockPreviewRendered).toHaveBeenCalledTimes(3);
});
