import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking, Text } from 'react-native';
import { ExternalLinkButton } from './ExternalLinkButton';
import { showMessageToast } from '../platform/toast/Toast';

jest.mock('../platform/toast/Toast', () => ({ showMessageToast: jest.fn() }));
const props = {
  label: 'Get help',
  url: 'mailto:help@example.com?subject=Help',
  failureMessage: 'Please email help@example.com.',
  channel: 'activity',
};
const openUrl = jest.spyOn(Linking, 'openURL');
beforeEach(() => {
  openUrl.mockReset();
  jest.mocked(showMessageToast).mockClear();
});
afterAll(() => openUrl.mockRestore());

it('opens the exact destination once while busy, then makes the action available again', async () => {
  let resolve: (() => void) | undefined;
  openUrl.mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const screen = await render(
    <ExternalLinkButton {...props}>
      <Text>Custom row</Text>
    </ExternalLinkButton>,
  );
  const button = screen.getByRole('button', { name: 'Get help' });
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(openUrl).toHaveBeenCalledTimes(1);
  expect(openUrl).toHaveBeenCalledWith(props.url);
  expect(button.props.accessibilityState).toEqual({
    disabled: true,
    busy: true,
  });
  await act(async () => {
    resolve!();
  });
  expect(button.props.accessibilityState).toEqual({
    disabled: false,
    busy: false,
  });
  expect(screen.getByText('Custom row')).toBeTruthy();
});

it('shows only approved failure copy and allows a successful retry', async () => {
  openUrl
    .mockRejectedValueOnce(new Error('private transport detail'))
    .mockResolvedValueOnce(undefined);
  const screen = await render(<ExternalLinkButton {...props} />);
  const button = screen.getByRole('button', { name: 'Get help' });
  await fireEvent.press(button);
  await waitFor(() =>
    expect(showMessageToast).toHaveBeenCalledWith(
      'activity',
      props.failureMessage,
    ),
  );
  expect(button.props.accessibilityState.disabled).toBe(false);
  await fireEvent.press(button);
  await waitFor(() => expect(button.props.accessibilityState.busy).toBe(false));
  expect(openUrl).toHaveBeenCalledTimes(2);
  expect(showMessageToast).toHaveBeenCalledTimes(1);
});

it('keeps an unavailable destination disabled', async () => {
  const screen = await render(<ExternalLinkButton {...props} url={null} />);
  const button = screen.getByRole('button', { name: 'Get help' });
  expect(button.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(button);
  expect(openUrl).not.toHaveBeenCalled();
});

it('does not present a late failure after leaving the screen', async () => {
  let reject: ((reason: Error) => void) | undefined;
  openUrl.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const screen = await render(<ExternalLinkButton {...props} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Get help' }));
  await screen.unmount();
  await act(async () => {
    reject!(new Error('late failure'));
  });
  expect(showMessageToast).not.toHaveBeenCalled();
});
