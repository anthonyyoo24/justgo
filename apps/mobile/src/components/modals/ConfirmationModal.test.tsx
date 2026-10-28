import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { ConfirmationModal } from './ConfirmationModal';
import { colors } from '../../theme/tokens';
import { useModalIsolation } from '../../platform/modals/useModalIsolation';

const originalWindow = Dimensions.get('window');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../../platform/modals/useModalIsolation', () => ({
  useModalIsolation: jest.fn(),
}));
const cancel = jest.fn();
const confirm = jest.fn();
const props = {
  title: 'Delete saved data?',
  message: 'Your account and downloaded files remain.',
  confirmLabel: 'Delete',
  progressLabel: 'Deleting saved data',
  busy: false,
  disabled: false,
  error: null,
  destructive: true,
  onCancel: cancel,
  onConfirm: confirm,
};
beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(
  async () => await act(() => Dimensions.set({ window: originalWindow })),
);
it('retains modal isolation, device safe areas and accessible destructive actions', async () => {
  const screen = await render(<ConfirmationModal {...props} />);
  expect(useModalIsolation).toHaveBeenCalledWith(
    expect.objectContaining({ current: expect.anything() }),
  );
  const modal = screen.container.queryAll(
    (node) => typeof node.props.onRequestClose === 'function',
  )[0]!;
  expect(modal.props).toMatchObject({
    transparent: true,
    visible: true,
    presentationStyle: 'overFullScreen',
  });
  expect(screen.getByLabelText(props.title).parent!.props.style).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ paddingTop: 47, paddingBottom: 34 }),
    ]),
  );
  expect(screen.getByLabelText(props.title)).toHaveProp(
    'accessibilityViewIsModal',
    true,
  );
  expect(screen.getByText(props.confirmLabel)).toHaveStyle({
    color: '#B3261E',
  });
  await fireEvent.press(
    screen.getByRole('button', { name: props.confirmLabel }),
  );
  expect(confirm).toHaveBeenCalledTimes(1);
  await fireEvent(screen.getByLabelText(props.title), 'accessibilityEscape');
  expect(cancel).toHaveBeenCalledTimes(1);
});
it('stacks the actions at larger font sizes and guards native dismissal while busy', async () => {
  await act(() =>
    Dimensions.set({ window: { ...originalWindow, fontScale: 2 } }),
  );
  const screen = await render(<ConfirmationModal {...props} busy />);
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveStyle({
    width: '100%',
  });
  expect(screen.getByRole('button', { name: props.confirmLabel })).toHaveStyle({
    width: '100%',
  });
  expect(
    screen.getByRole('progressbar', { name: props.progressLabel }),
  ).toBeTruthy();
  await act(() =>
    screen.container
      .queryAll((node) => typeof node.props.onRequestClose === 'function')[0]!
      .props.onRequestClose(),
  );
  await fireEvent(screen.getByLabelText(props.title), 'accessibilityEscape');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await fireEvent.press(
    screen.getByRole('button', { name: props.confirmLabel }),
  );
  expect(cancel).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});

it('uses the normal action color for logout, including its loading indicator', async () => {
  const screen = await render(
    <ConfirmationModal {...props} destructive={false} confirmLabel="Log out" />,
  );
  expect(screen.getByText('Log out')).toHaveStyle({ color: colors.ink });
  await screen.rerender(
    <ConfirmationModal
      {...props}
      destructive={false}
      confirmLabel="Log out"
      progressLabel="Logging out"
      busy
    />,
  );
  expect(screen.getByRole('progressbar', { name: 'Logging out' })).toHaveProp(
    'color',
    colors.ink,
  );
});
