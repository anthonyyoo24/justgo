import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, Dimensions, StyleSheet } from 'react-native';
import { ICloudSyncSheet } from './ICloudSyncSheet';
import { useModalIsolation } from '../../../platform/modals/useModalIsolation';
import { fontFamilies, typography } from '../../../theme/tokens';
import { iCloudSyncMessages } from './icloud-messages';

jest.mock('react-native-svg', () =>
  jest.requireActual('../../../../test-support/svg'),
);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../../../platform/modals/useModalIsolation', () => ({
  useModalIsolation: jest.fn(),
}));
const originalWindow = Dimensions.get('window');
const props = {
  busy: false,
  disabled: false,
  error: null,
  reduceMotion: true,
  onClose: jest.fn(),
  onStart: jest.fn(),
};
beforeEach(async () => {
  jest.clearAllMocks();
  await act(() =>
    Dimensions.set({ window: { ...originalWindow, fontScale: 1 } }),
  );
});
afterEach(
  async () => await act(() => Dimensions.set({ window: originalWindow })),
);

it('presents the native, isolated sheet with live text and a restrained branded action', async () => {
  const screen = await render(<ICloudSyncSheet {...props} />);
  expect(useModalIsolation).toHaveBeenCalledWith(
    expect.objectContaining({ current: expect.anything() }),
  );
  expect(
    screen.container.queryAll((node) => node.type === 'Modal')[0]!.props,
  ).toMatchObject({
    transparent: true,
    presentationStyle: 'overFullScreen',
    animationType: 'none',
  });
  expect(screen.getByTestId('icloud-sync-sheet')).toHaveProp(
    'accessibilityViewIsModal',
    true,
  );
  expect(
    screen.getByText(
      'Your Apple ID will be used to securely save your challenge history, feelings and reflections in iCloud.',
    ),
  ).toBeTruthy();
  expect(screen.getByText('Start Syncing')).toHaveStyle({ fontSize: 14 });
  expect(screen.getByRole('header', { name: 'iCloud Sync' })).toHaveStyle({
    fontFamily: fontFamilies.editorial,
    fontSize: typography.heading.fontSize,
    letterSpacing: -0.5,
  });
  expect(
    screen
      .getByRole('button', { name: 'Start Syncing' })
      .queryAll((node) => node.props.viewBox === '0 0 24 24')[0]!.props.height,
  ).toBe(20);
  await fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  await fireEvent(
    screen.getByTestId('icloud-sync-sheet'),
    'accessibilityEscape',
  );
  expect(props.onStart).toHaveBeenCalledTimes(1);
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

it('keeps errors and large text accessible with scrolling and an available close action', async () => {
  await act(() =>
    Dimensions.set({
      window: { ...originalWindow, height: 568, width: 320, fontScale: 2 },
    }),
  );
  const screen = await render(
    <ICloudSyncSheet
      {...props}
      reduceMotion={false}
      error="iCloud storage is full."
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'iCloud storage is full.',
  );
  expect(screen.getByText('Start Syncing')).toHaveStyle({ fontSize: 28 });
  expect(
    screen
      .getByRole('button', { name: 'Start Syncing' })
      .queryAll((node) => node.props.viewBox === '0 0 24 24')[0]!.props.height,
  ).toBe(40);
  expect(screen.getByRole('button', { name: 'Start Syncing' })).toBeEnabled();
  expect(
    screen.getByRole('button', { name: 'Close iCloud Sync' }),
  ).toBeEnabled();
  expect(
    screen.container.queryAll((node) => node.type === 'Modal')[0]!.props
      .animationType,
  ).toBe('none');
  expect(screen.getByTestId('icloud-sync-message-space')).toHaveStyle({
    minHeight: 80,
    flexShrink: 0,
  });
  expect(screen.getByRole('alert').props.numberOfLines).toBeUndefined();
});

it('reserves two message lines before syncing without resizing the artwork for any error', async () => {
  await act(() =>
    Dimensions.set({
      window: { ...originalWindow, height: 844, width: 390, fontScale: 1 },
    }),
  );
  const screen = await render(<ICloudSyncSheet {...props} />);
  const artwork = StyleSheet.flatten(
    screen.getByTestId('icloud-sync-artwork').props.style,
  );
  const messageSpace = StyleSheet.flatten(
    screen.getByTestId('icloud-sync-message-space').props.style,
  );
  expect(artwork).toMatchObject({ height: 300, flexShrink: 0 });
  expect(artwork.flexGrow).toBeUndefined();
  expect(messageSpace).toMatchObject({ minHeight: 40, flexShrink: 0 });
  expect(screen.queryByRole('alert')).toBeNull();

  for (const message of Object.values(iCloudSyncMessages)) {
    await screen.rerender(<ICloudSyncSheet {...props} error={message} />);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByTestId('icloud-sync-artwork').props.style).toEqual([
      expect.objectContaining({ flexShrink: 0 }),
      expect.objectContaining({ height: artwork.height }),
    ]);
    expect(
      StyleSheet.flatten(
        screen.getByTestId('icloud-sync-message-space').props.style,
      ),
    ).toEqual(messageSpace);
  }
  await screen.rerender(<ICloudSyncSheet {...props} busy />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByTestId('icloud-sync-artwork')).toHaveStyle({
    height: artwork.height,
  });
  expect(screen.getByTestId('icloud-sync-message-space')).toHaveStyle({
    minHeight: 40,
  });
});

it('dims the full screen immediately while only the panel slides, once per presentation', async () => {
  const timing = jest
    .spyOn(Animated, 'timing')
    .mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
  try {
    const screen = await render(
      <ICloudSyncSheet {...props} reduceMotion={false} />,
    );
    expect(
      screen.container.queryAll((node) => node.type === 'Modal')[0]!.props
        .animationType,
    ).toBe('none');
    const backdrop = screen.getByTestId('icloud-sync-backdrop', {
      includeHiddenElements: true,
    });
    expect(backdrop).toHaveStyle({
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    });
    expect(StyleSheet.flatten(backdrop.props.style).transform).toBeUndefined();
    expect(
      StyleSheet.flatten(
        screen.getByTestId('icloud-sync-modal-root').props.style,
      ).transform,
    ).toBeUndefined();
    await fireEvent(
      screen.container.queryAll((node) => node.type === 'Modal')[0]!,
      'show',
    );
    expect(timing).toHaveBeenCalledTimes(1);
    expect(timing.mock.calls[0]?.[1]).toMatchObject({
      toValue: 0,
      duration: 280,
    });
    const offset = timing.mock.calls[0]?.[0] as Animated.Value;
    await act(() => offset.setValue(240));
    await fireEvent(screen.getByTestId('icloud-sync-sheet'), 'layout', {
      nativeEvent: { layout: { width: 390, height: 633 } },
    });
    await fireEvent(
      screen.container.queryAll((node) => node.type === 'Modal')[0]!,
      'show',
    );
    expect(timing).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('icloud-sync-sheet')).toHaveStyle({
      transform: [{ translateY: 240 }],
    });
    expect(backdrop).toHaveStyle({
      top: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    });
    await screen.unmount();
  } finally {
    timing.mockRestore();
  }
});

it('waits for the panel exit, blocks starting sync during dismissal, and ignores a late completion after unmount', async () => {
  let complete: ((result: { finished: boolean }) => void) | undefined;
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: (callback) => {
      complete = callback;
    },
    stop: jest.fn(),
    reset: jest.fn(),
  });
  try {
    const screen = await render(
      <ICloudSyncSheet {...props} reduceMotion={false} />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Close iCloud Sync' }),
    );
    expect(props.onClose).not.toHaveBeenCalled();
    expect(timing.mock.calls[0]?.[1]).toMatchObject({ duration: 220 });
    expect(
      screen.getByRole('button', { name: 'Start Syncing' }),
    ).toBeDisabled();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Start Syncing' }),
    );
    expect(props.onStart).not.toHaveBeenCalled();
    await act(() => complete?.({ finished: true }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await screen.unmount();
    await act(() => complete?.({ finished: true }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  } finally {
    timing.mockRestore();
  }
});
