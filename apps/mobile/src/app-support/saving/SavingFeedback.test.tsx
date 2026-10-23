import { SavingNotice } from './SavingNotice';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking, Text } from 'react-native';
import { SavingFeedbackShell, SavingSheetSurface } from './SavingFeedback';
import { savingRiskCopy } from './presentation';
import {
  dismissActivityToasts,
  showRecoveryToast,
  showMessageToast,
} from '../../platform/toast/Toast';
import { contactFailureMessage, supportContact } from '../contact';
import { AccountRepository } from '../../data/activity/repository';
import {
  MemoryStorage,
  backend,
  card,
  input,
  owner,
  otherOwner,
  today,
  zone,
} from '../../../test-support/journal';
let mockRepository: AccountRepository;
let mockConnected = true;
const mockActivity = {
  toastChannel: 'activity',
  setToastChannel(channel: string) {
    this.toastChannel = channel;
  },
};
const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../../platform/toast/Toast', () => ({
  ToastHost: ({ channel }: { channel: string }) => {
    const { View } = require('react-native');
    return <View testID={`toast-host-${channel}`} />;
  },
  showRecoveryToast: jest.fn(),
  dismissActivityToasts: jest.fn(),
  showMessageToast: jest.fn(),
}));
jest.mock('../providers/AppProvider', () => ({
  useRuntime: () => ({ activity: mockActivity }),
  useActivityState: () => {
    const { useSyncExternalStore } = require('react');
    const state = useSyncExternalStore(
      mockConnected ? mockRepository.store.subscribe : () => () => {},
      mockConnected ? mockRepository.store.getState : () => null,
    );
    return { repository: mockConnected ? mockRepository : null, state };
  },
}));
beforeEach(async () => {
  mockConnected = true;
  mockActivity.toastChannel = 'activity';
  mockRouter.push.mockReset();
  jest.mocked(showRecoveryToast).mockClear();
  jest.mocked(dismissActivityToasts).mockClear();
  jest.mocked(showMessageToast).mockClear();
  mockRepository = new AccountRepository({
    accountId: owner,
    storage: new MemoryStorage(),
    transport: backend(),
    today,
    timeZone: zone,
  });
  mockRepository.setEnvironment({ active: true, online: false });
  await mockRepository.complete(input(), card);
});
afterEach(() => mockRepository.dispose());
it.each([false, true])(
  'uses private support and the visible toast host in saving recovery (sheet=%s)',
  async (sheet) => {
    const open = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('native detail'))
      .mockResolvedValueOnce(undefined);
    mockRepository.store.setState({ hydrationError: 'unreadable' });
    const screen = await render(
      sheet ? <SavingSheetSurface /> : <SavingNotice />,
    );
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Review activity that couldn’t upload',
      }),
    );
    const help = screen.getByRole('button', { name: 'Get help' });
    await fireEvent.press(help);
    await waitFor(() =>
      expect(showMessageToast).toHaveBeenCalledWith(
        sheet ? 'activity-sheet' : 'activity',
        contactFailureMessage,
      ),
    );
    expect(help.props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(help);
    await waitFor(() => expect(help.props.accessibilityState.busy).toBe(false));
    expect(open).toHaveBeenNthCalledWith(2, supportContact);
    open.mockRestore();
  },
);
it('removes account presentation on disconnection and ignores recovery while the account is parked', async () => {
  const screen = await render(
    <SavingFeedbackShell>
      <Text>App</Text>
    </SavingFeedbackShell>,
  );
  await act(() =>
    mockRepository.store.setState({
      warning: {
        visible: true,
        dismissed: false,
        episode: 1,
        online: false,
        storageFull: true,
      },
    }),
  );
  expect(screen.getByTestId('saving-risk-banner')).toBeTruthy();
  mockConnected = false;
  await screen.rerender(
    <SavingFeedbackShell>
      <Text>Recovery route</Text>
    </SavingFeedbackShell>,
  );
  expect(screen.queryByTestId('saving-risk-banner')).toBeNull();
  expect(dismissActivityToasts).toHaveBeenCalled();
  await act(() =>
    mockRepository.store.setState({ warning: null, recoverySequence: 1 }),
  );
  mockConnected = true;
  await screen.rerender(
    <SavingFeedbackShell>
      <Text>Recovered account</Text>
    </SavingFeedbackShell>,
  );
  expect(showRecoveryToast).not.toHaveBeenCalled();
});
it('reserves space for risk, allows manual dismissal, and announces exactly one full recovery even after dismissal', async () => {
  const screen = await render(
    <SavingFeedbackShell>
      <Text>Route content</Text>
    </SavingFeedbackShell>,
  );
  await act(() =>
    mockRepository.store.setState({
      warning: {
        visible: true,
        dismissed: false,
        episode: 1,
        online: false,
        storageFull: true,
      },
    }),
  );
  expect(screen.getByTestId('saving-risk-banner')).toBeTruthy();
  expect(
    screen.getByText(/Your phone is offline and storage is full/),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Close saving warning' }),
  );
  expect(screen.queryByTestId('saving-risk-banner')).toBeNull();
  await act(() => mockRepository.store.setState({ remoteRefreshSequence: 1 }));
  expect(showRecoveryToast).not.toHaveBeenCalled();
  await act(() =>
    mockRepository.store.setState({ warning: null, recoverySequence: 1 }),
  );
  expect(showRecoveryToast).toHaveBeenCalledTimes(1);
  expect(showRecoveryToast).toHaveBeenCalledWith('activity', `${owner}:1`);
  await screen.rerender(
    <SavingFeedbackShell>
      <Text>Another route</Text>
    </SavingFeedbackShell>,
  );
  expect(showRecoveryToast).toHaveBeenCalledTimes(1);
});
it('does not confuse a backend outage with an offline phone or infer storage full', () => {
  expect(
    savingRiskCopy({
      visible: true,
      dismissed: false,
      episode: 1,
      online: true,
      storageFull: false,
    }),
  ).toMatch(/can’t save/);
  expect(
    savingRiskCopy({
      visible: true,
      dismissed: false,
      episode: 1,
      online: true,
      storageFull: false,
    }),
  ).not.toMatch(/offline|full/);
  expect(
    savingRiskCopy({
      visible: true,
      dismissed: false,
      episode: 1,
      online: true,
      storageFull: true,
    }),
  ).toMatch(/storage is full/);
  expect(
    savingRiskCopy({
      visible: true,
      dismissed: false,
      episode: 1,
      online: false,
      storageFull: false,
    }),
  ).toMatch(/offline/);
});
it('presents notices within a covering sheet and routes the sole toast to that host', async () => {
  const screen = await render(
    <SavingFeedbackShell>
      <SavingSheetSurface />
    </SavingFeedbackShell>,
  );
  expect(mockActivity.toastChannel).toBe('activity-sheet');
  await act(() => mockRepository.store.setState({ recoverySequence: 1 }));
  expect(showRecoveryToast).toHaveBeenCalledWith(
    'activity-sheet',
    `${owner}:1`,
  );
  await screen.rerender(
    <SavingFeedbackShell>
      <Text>Closed sheet</Text>
    </SavingFeedbackShell>,
  );
  expect(mockActivity.toastChannel).toBe('activity');
  expect(showRecoveryToast).toHaveBeenCalledTimes(1);
});
it('mirrors a saving notice in a temporary native cover without duplicating or releasing the destination toast host', async () => {
  mockRepository.store.setState({
    warning: {
      visible: true,
      dismissed: false,
      episode: 1,
      online: false,
      storageFull: true,
    },
  });
  const surfaces = (covered: boolean) => (
    <>
      {covered && <SavingSheetSurface key="cover" toastHostEnabled={false} />}
      <SavingSheetSurface key="destination" />
    </>
  );
  const screen = await render(surfaces(true));
  expect(screen.getAllByTestId('saving-risk-banner')).toHaveLength(2);
  expect(screen.getAllByTestId('toast-host-activity-sheet')).toHaveLength(1);
  expect(mockActivity.toastChannel).toBe('activity-sheet');
  await screen.rerender(surfaces(false));
  expect(screen.getAllByTestId('saving-risk-banner')).toHaveLength(1);
  expect(mockActivity.toastChannel).toBe('activity-sheet');
  await screen.unmount();
  expect(mockActivity.toastChannel).toBe('activity');
});
it('clears stale account feedback without treating switching accounts as recovery', async () => {
  const screen = await render(
    <SavingFeedbackShell>
      <Text>Account A</Text>
    </SavingFeedbackShell>,
  );
  const old = mockRepository;
  mockRepository = new AccountRepository({
    accountId: otherOwner,
    storage: new MemoryStorage(),
    transport: backend(),
    today,
    timeZone: zone,
  });
  mockRepository.store.setState({ recoverySequence: 3 });
  await screen.rerender(
    <SavingFeedbackShell>
      <Text>Account B</Text>
    </SavingFeedbackShell>,
  );
  expect(dismissActivityToasts).toHaveBeenCalled();
  expect(showRecoveryToast).not.toHaveBeenCalled();
  old.dispose();
});
it('keeps unreadable storage and retained failed records discoverable outside the editor', async () => {
  const screen = await render(<SavingNotice />);
  await act(() =>
    mockRepository.store.setState({ hydrationError: 'unreadable' }),
  );
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Review activity that couldn’t upload',
    }),
  );
  expect(screen.getByText(/original copy has been kept/)).toBeTruthy();
  const journal = structuredClone(mockRepository.store.getState().journal);
  const operation = journal.operations[0]!;
  operation.state = 'rejected';
  operation.code = 'ACCESS_REQUIRED';
  operation.requestId = 'safe-reference';
  await act(() => mockRepository.store.setState({ journal }));
  expect(screen.getByText(/subscription coverage/)).toBeTruthy();
  expect(screen.getByText('Reference: safe-reference')).toBeTruthy();
  operation.code = 'NOT_FOUND';
  await act(() =>
    mockRepository.store.setState({ journal: structuredClone(journal) }),
  );
  expect(screen.getByText(/server couldn’t find/)).toBeTruthy();
  operation.code = 'INVALID_REQUEST';
  await act(() =>
    mockRepository.store.setState({ journal: structuredClone(journal) }),
  );
  expect(screen.getByText(/Repeating the same request/)).toBeTruthy();
  operation.state = 'auth';
  await act(() =>
    mockRepository.store.setState({ journal: structuredClone(journal) }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Recover account' }),
  );
  expect(mockRouter.push).toHaveBeenCalledWith('/recovery');
});
it('opens locally preserved writing alongside a rejected completion', async () => {
  await mockRepository.submitReflection(
    input().id,
    '20000000-0000-4000-8000-000000000002',
    { text: 'Retained writing' },
  );
  const journal = structuredClone(mockRepository.store.getState().journal);
  const operation = journal.operations[0]!;
  operation.state = 'rejected';
  operation.code = 'INVALID_REQUEST';
  mockRepository.store.setState({ journal });
  const screen = await render(<SavingNotice />);
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Review activity that couldn’t upload',
    }),
  );
  expect(screen.getByText('Retained writing')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Review reflection' }),
  );
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/reflection',
    params: { attemptId: input().id, source: 'recovery' },
  });
  await fireEvent.press(
    screen.getByRole('button', { name: 'Hide saving details' }),
  );
  expect(screen.queryByText('Retained writing')).toBeNull();
});

it('keeps retained problems readable in the active modal without offering page navigation', async () => {
  await mockRepository.submitReflection(
    input().id,
    '20000000-0000-4000-8000-000000000002',
    { text: 'Retained active-modal writing' },
  );
  const journal = structuredClone(mockRepository.store.getState().journal);
  const operation = journal.operations[0]!;
  operation.state = 'rejected';
  operation.code = 'INVALID_REQUEST';
  mockRepository.store.setState({ journal });
  const screen = await render(<SavingSheetSurface navigationEnabled={false} />);
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Review activity that couldn’t upload',
    }),
  );
  expect(screen.getByText('Retained active-modal writing')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Review reflection' }),
  ).toBeNull();
  operation.state = 'auth';
  await act(() =>
    mockRepository.store.setState({ journal: structuredClone(journal) }),
  );
  expect(screen.queryByRole('button', { name: 'Recover account' })).toBeNull();
  expect(mockRouter.push).not.toHaveBeenCalled();
  await screen.rerender(<SavingSheetSurface />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Recover account' }),
  );
  expect(mockRouter.push).toHaveBeenCalledWith('/recovery');
});
