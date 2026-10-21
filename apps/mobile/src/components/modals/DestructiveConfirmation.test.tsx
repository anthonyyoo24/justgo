import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions, Modal, View } from 'react-native';
import { DestructiveConfirmation } from './DestructiveConfirmation';
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
  onCancel: cancel,
  onConfirm: confirm,
};
beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => act(() => Dimensions.set({ window: originalWindow })));
it('retains modal isolation, device safe areas and accessible destructive actions', () => {
  const screen = render(<DestructiveConfirmation {...props} />);
  expect(useModalIsolation).toHaveBeenCalledWith(
    expect.objectContaining({ current: expect.anything() }),
  );
  const modal = screen.UNSAFE_getByType(Modal);
  expect(modal.props).toMatchObject({
    transparent: true,
    visible: true,
    presentationStyle: 'overFullScreen',
  });
  expect(modal.findByType(View).props.style).toEqual(
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
  fireEvent.press(screen.getByRole('button', { name: props.confirmLabel }));
  expect(confirm).toHaveBeenCalledTimes(1);
  fireEvent(screen.getByLabelText(props.title), 'accessibilityEscape');
  expect(cancel).toHaveBeenCalledTimes(1);
});
it('stacks the actions at larger font sizes and guards native dismissal while busy', () => {
  act(() => Dimensions.set({ window: { ...originalWindow, fontScale: 2 } }));
  const screen = render(<DestructiveConfirmation {...props} busy />);
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveStyle({
    width: '100%',
  });
  expect(screen.getByRole('button', { name: props.confirmLabel })).toHaveStyle({
    width: '100%',
  });
  expect(
    screen.getByRole('progressbar', { name: props.progressLabel }),
  ).toBeTruthy();
  act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
  fireEvent(screen.getByLabelText(props.title), 'accessibilityEscape');
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.press(screen.getByRole('button', { name: props.confirmLabel }));
  expect(cancel).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});
