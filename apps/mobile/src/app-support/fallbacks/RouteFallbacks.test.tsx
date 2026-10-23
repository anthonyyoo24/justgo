import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';
import { Stack } from 'expo-router';
import { Text } from 'react-native';
import NotFoundRoute from '../../app/+not-found';
import { errorReporter } from '../diagnostics/start';
import { RouteErrorScreen } from './RouteErrorScreen';

const privateText = 'Disposable private reflection text';
const StackLayout = () => (
  <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
);

afterEach(() => jest.restoreAllMocks());

it('replaces a crashed route with a retryable screen that hides the error text', async () => {
  // React reports every caught render error; assert it is the expected one.
  const report = jest.spyOn(console, 'error').mockImplementation(() => {});
  const capture = jest.spyOn(errorReporter, 'capture');
  let broken = true;
  function Home() {
    if (broken) throw new Error(privateText);
    return <Text>Home ready</Text>;
  }
  await renderRouter(
    {
      _layout: { default: StackLayout, ErrorBoundary: RouteErrorScreen },
      index: Home,
    },
    { initialUrl: '/' },
  );
  expect(
    screen.getByRole('header', { name: 'Something went wrong' }),
  ).toBeTruthy();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'JustGO couldn’t show this screen. Try again, or close and reopen the app.',
  );
  expect(screen.queryByText(privateText, { exact: false })).toBeNull();
  expect(capture).toHaveBeenCalledWith(new Error(privateText));
  expect(report).toHaveBeenCalledTimes(1);
  expect(report.mock.calls[0]![1]).toEqual(new Error(privateText));
  expect(report.mock.calls[0]).toEqual([
    'Caught error:',
    new Error(privateText),
    expect.objectContaining({
      componentStack: expect.stringContaining('Home'),
      errorBoundary: expect.anything(),
    }),
  ]);

  broken = false;
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Home ready')).toBeTruthy();
  expect(
    screen.queryByRole('header', { name: 'Something went wrong' }),
  ).toBeNull();
});

it('keeps showing the error screen when a retry fails again', async () => {
  const report = jest.spyOn(console, 'error').mockImplementation(() => {});
  let renders = 0;
  function Home(): never {
    renders++;
    throw new Error(privateText);
  }
  await renderRouter(
    {
      _layout: { default: StackLayout, ErrorBoundary: RouteErrorScreen },
      index: Home,
    },
    { initialUrl: '/' },
  );
  const before = renders;
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(renders).toBeGreaterThan(before));
  expect(
    screen.getByRole('header', { name: 'Something went wrong' }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  expect(
    report.mock.calls.every((call) => String(call[1]).includes(privateText)),
  ).toBe(true);
});

it('shows unknown links as not found and enters the access gate', async () => {
  const navigation = await renderRouter(
    {
      _layout: StackLayout,
      index: () => <Text>Home ready</Text>,
      access: () => <Text>Access gate ready</Text>,
      '+not-found': NotFoundRoute,
    },
    { initialUrl: '/no-such-page' },
  );
  expect(screen.getByRole('header', { name: 'Page not found' })).toBeTruthy();
  expect(
    screen.getByText('This link doesn’t open anything in JustGO.'),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Go home' }));
  await waitFor(() => expect(navigation.getPathname()).toBe('/access'));
  expect(screen.getByText('Access gate ready')).toBeTruthy();
  expect(screen.queryByRole('header', { name: 'Page not found' })).toBeNull();
});
