import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';
import { SettingsScreen } from '../../features/settings/SettingsScreen';
import PreviewRoute from '../../app/preview';
import { Stack } from 'expo-router';
import { MotionContext } from '../../platform/motion/motion';

jest.mock('../../features/settings/export/SettingsExportRow', () => ({
  SettingsExportRow: () => null,
}));
jest.mock('../../platform/toast/Toast', () => ({
  showMessageToast: jest.fn(),
}));

it('navigates from the actual Settings link to haptics, rather than the general preview', async () => {
  const navigation = renderRouter(
    {
      _layout: () => (
        <MotionContext.Provider
          value={{
            reduceMotion: false,
            systemReduced: false,
            loading: false,
            saving: false,
            error: null,
            setReduced: async () => {},
          }}
        >
          <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
        </MotionContext.Provider>
      ),
      settings: SettingsScreen,
      preview: PreviewRoute,
    },
    { initialUrl: '/settings' },
  );
  fireEvent.press(screen.getByRole('link', { name: 'Test haptics' }));
  await waitFor(() =>
    expect(screen.getByRole('header', { name: 'Test haptics' })).toBeTruthy(),
  );
  expect(navigation.getPathname()).toBe('/preview');
  expect(navigation.getSearchParams()).toEqual({ mode: 'haptics' });
  expect(
    screen.queryByText('SCREEN PREVIEW · No activity is saved'),
  ).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => expect(navigation.getPathname()).toBe('/settings'));
});
