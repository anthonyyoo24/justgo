jest.mock('react-native-svg', () =>
  jest.requireActual('../../../../test-support/svg'),
);
import { act, fireEvent, render } from '@testing-library/react-native';
import { CancelSubscriptionRow } from './CancelSubscriptionRow';
import { openSubscriptionManagement } from '../../../platform/subscriptions/open-subscriptions';
import { showMessageToast } from '../../../platform/toast/Toast';

jest.mock('../../../platform/subscriptions/open-subscriptions', () => ({
  openSubscriptionManagement: jest.fn(),
}));
jest.mock('../../../platform/toast/Toast', () => ({
  showMessageToast: jest.fn(),
}));
beforeEach(() => jest.clearAllMocks());

it('opens Apple once while busy and restores the row after dismissal', async () => {
  let finish!: () => void;
  jest.mocked(openSubscriptionManagement).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const screen = await render(<CancelSubscriptionRow />);
  // Regression: the billing icon must have a complete card border, including
  // its bottom-right corner; the previous open path omitted that corner.
  expect(
    screen.container.queryAll((node) => node.type === 'Rect')[0],
  ).toBeTruthy();
  const button = screen.getByLabelText('Cancel subscription');
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(openSubscriptionManagement).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  await act(async () => {
    finish();
  });
  expect(button).toBeEnabled();
  expect(showMessageToast).not.toHaveBeenCalled();
});
it('shows safe failure copy and supports a retry without claiming cancellation', async () => {
  jest
    .mocked(openSubscriptionManagement)
    .mockRejectedValueOnce(new Error('private StoreKit details'))
    .mockResolvedValueOnce(undefined);
  const screen = await render(<CancelSubscriptionRow />);
  await act(
    async () =>
      await fireEvent.press(screen.getByLabelText('Cancel subscription')),
  );
  expect(showMessageToast).toHaveBeenCalledWith(
    'activity',
    'Couldn’t open subscription settings. Please try again.',
  );
  expect(screen.getByLabelText('Cancel subscription')).toBeEnabled();
  await act(
    async () =>
      await fireEvent.press(screen.getByLabelText('Cancel subscription')),
  );
  expect(openSubscriptionManagement).toHaveBeenCalledTimes(2);
  expect(showMessageToast).toHaveBeenCalledTimes(1);
});
it('does not show a late error after leaving the screen', async () => {
  let fail!: (reason: Error) => void;
  jest.mocked(openSubscriptionManagement).mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  const screen = await render(<CancelSubscriptionRow />);
  await fireEvent.press(screen.getByLabelText('Cancel subscription'));
  await screen.unmount();
  await act(async () => {
    fail(new Error('late failure'));
  });
  expect(showMessageToast).not.toHaveBeenCalled();
});
