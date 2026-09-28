import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProgressResponse } from '@justgo/contracts';
import { accountKey } from '../../lib/account-client';
import { ProgressScreen } from './ProgressScreen';

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  Link: () => null,
}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('./calendar', () => ({
  ...jest.requireActual('./calendar'),
  currentMonth: () => '2026-09',
}));

let mockAccount = { userId: 'user-one' };
let mockClient: { queries: QueryClient; request: jest.Mock };
jest.mock('../shell/AppProvider', () => ({
  useRuntime: () => ({ client: mockClient }),
  useIdentity: () => ({ account: mockAccount }),
}));

const september: ProgressResponse = {
  month: '2026-09',
  today: '2026-09-28',
  currentStreak: 2,
  bestStreak: 5,
  totalReps: 10,
  monthlyReps: 2,
  activeDays: 1,
  days: [{ date: '2026-09-18', reps: 2 }],
};
const august: ProgressResponse = {
  ...september,
  month: '2026-08',
  monthlyReps: 4,
  activeDays: 2,
  days: [
    { date: '2026-08-10', reps: 1 },
    { date: '2026-08-20', reps: 3 },
  ],
};

beforeEach(() => {
  mockAccount = { userId: 'user-one' };
  mockClient = {
    queries: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    request: jest.fn().mockResolvedValue(september),
  };
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  mockClient.queries.setQueryData(
    accountKey('user-one', 'progress', 'month', '2026-09', timeZone),
    september,
  );
});

afterEach(() => mockClient.queries.clear());

it('keeps the displayed month and summary together until an uncached month loads', async () => {
  let finishAugust!: (value: ProgressResponse) => void;
  const pendingAugust = new Promise<ProgressResponse>((resolve) => {
    finishAugust = resolve;
  });
  mockClient.request.mockImplementation((path: string) =>
    path.includes('month=2026-08') ? pendingAugust : Promise.resolve(september),
  );
  const screen = render(
    <QueryClientProvider client={mockClient.queries}>
      <ProgressScreen />
    </QueryClientProvider>,
  );

  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  await waitFor(() =>
    expect(mockClient.request).toHaveBeenCalledWith(
      expect.stringContaining('month=2026-08'),
      expect.anything(),
      expect.anything(),
    ),
  );
  expect(screen.getByRole('header', { name: 'September 2026' })).toBeTruthy();
  expect(screen.getByText('on 1 active day')).toBeTruthy();
  expect(screen.queryByText('—')).toBeNull();
  expect(screen.getByLabelText('Loading month')).toBeTruthy();

  await act(async () => finishAugust(august));
  await waitFor(() =>
    expect(screen.getByRole('header', { name: 'August 2026' })).toBeTruthy(),
  );
  expect(screen.getByText('on 2 active days')).toBeTruthy();
  expect(screen.queryByText('—')).toBeNull();
  expect(screen.queryByLabelText('Loading month')).toBeNull();
});

it('does not show another account’s previous progress while its month loads', async () => {
  const screen = render(
    <QueryClientProvider client={mockClient.queries}>
      <ProgressScreen />
    </QueryClientProvider>,
  );
  let finishOther!: (value: ProgressResponse) => void;
  const pendingOther = new Promise<ProgressResponse>((resolve) => {
    finishOther = resolve;
  });
  mockClient.request.mockImplementation(() => pendingOther);
  mockAccount = { userId: 'user-two' };
  screen.rerender(
    <QueryClientProvider client={mockClient.queries}>
      <ProgressScreen />
    </QueryClientProvider>,
  );

  expect(screen.getByText('Loading your progress…')).toBeTruthy();
  expect(screen.getAllByText('—')).toHaveLength(4);
  expect(screen.queryByText('on 1 active day')).toBeNull();
  await act(async () => finishOther({ ...september, monthlyReps: 0 }));
});
