import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { Path } from 'react-native-svg';
import { ChallengeCard, ChallengeDeck } from './ChallengeDeck';
import { VenueArt } from './VenueArt';
import { panelOutline } from './challenge-design';
jest.mock('react-native-gesture-handler', () => {
  const chain = () => {
    const g: Record<string, unknown> = {};
    for (const name of [
      'enabled',
      'activeOffsetX',
      'failOffsetY',
      'onUpdate',
      'onEnd',
      'onFinalize',
    ])
      g[name] = () => g;
    return g;
  };
  return {
    Gesture: { Pan: chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const { useRef } = require('react');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (initial: unknown) => {
      const ref = useRef(null);
      if (!ref.current) {
        let value = initial;
        ref.current = {
          get: () => value,
          set: (next: unknown) => {
            value = next;
          },
        };
      }
      return ref.current;
    },
    useAnimatedStyle: () => ({}),
    cancelAnimation: jest.fn(),
    Easing: { out: () => 0, cubic: 0, bezier: () => 0 },
    withTiming: (
      to: unknown,
      _config: unknown,
      callback?: (done: boolean) => void,
    ) => {
      callback?.(true);
      return to;
    },
  };
});
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: () => void) => callback(),
}));
const cards = [
  { id: '1', text: 'Say hello.' },
  { id: '2', text: 'Ask a question.' },
  { id: '3', text: 'Give a compliment.' },
  { id: '4', text: 'Ask for a recommendation.' },
];
it('keeps button input exclusive while the same confirmed action is pending', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  let finish!: () => void;
  const action = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const screen = render(
    <ChallengeDeck
      cards={cards}
      venue="cafe"
      label="Cafe"
      turn={0}
      onAction={action}
    />,
  );
  await act(async () => {});
  fireEvent.press(screen.getByRole('button', { name: 'Skip challenge' }));
  fireEvent.press(screen.getByRole('button', { name: 'Accept challenge' }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(action).toHaveBeenCalledWith(-1);
  expect(
    screen.getByRole('button', { name: 'Accept challenge' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await act(async () => finish());
  expect(
    screen.getByRole('button', { name: 'Accept challenge' }).props
      .accessibilityState.disabled,
  ).toBe(false);
  expect(screen.getByLabelText('Cafe. Say hello.. Five minutes.')).toBeTruthy();
});
it('hides queued content from screen readers and renders no duplicate cards for a one-card queue', async () => {
  const screen = render(
    <ChallengeDeck
      cards={[cards[0]!]}
      venue="cafe"
      label="Cafe"
      turn={0}
      onAction={async () => {}}
    />,
  );
  await act(async () => {});
  expect(screen.getAllByText('Say hello.')).toHaveLength(1);
  screen.rerender(
    <ChallengeDeck
      cards={cards}
      venue="cafe"
      label="Cafe"
      turn={0}
      onAction={async () => {}}
    />,
  );
  expect(screen.queryByText('Ask a question.')).toBeNull();
});
it('does not send an acceptance when navigation interrupts before the animation hands off', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  const action = jest.fn(async () => {});
  const screen = render(
    <ChallengeDeck
      cards={cards}
      venue="cafe"
      label="Cafe"
      turn={0}
      onAction={action}
    />,
  );
  await act(async () => {});
  fireEvent.press(screen.getByRole('button', { name: 'Accept challenge' }));
  screen.unmount();
  await act(async () => {});
  expect(action).not.toHaveBeenCalled();
});

it('keeps the frame and action area stable when short and long challenges advance', async () => {
  const long = {
    id: 'long',
    text: 'Ask someone nearby for a recommendation for a place they enjoy visiting in the neighborhood.',
  };
  const props = { venue: 'cafe', label: 'Cafe', onAction: async () => {} };
  const screen = render(
    <ChallengeDeck {...props} cards={[cards[0]!, long]} turn={0} />,
  );
  await act(async () => {});
  const frame = StyleSheet.flatten(
    screen.getByTestId('challenge-card').props.style,
  );
  const stage = StyleSheet.flatten(
    screen.getByTestId('challenge-stage').props.style,
  );
  expect(frame.height).toBeGreaterThan(0);
  screen.rerender(
    <ChallengeDeck {...props} cards={[long, cards[0]!]} turn={1} />,
  );
  expect(
    StyleSheet.flatten(screen.getByTestId('challenge-card').props.style),
  ).toMatchObject({
    width: frame.width,
    height: frame.height,
  });
  expect(
    StyleSheet.flatten(screen.getByTestId('challenge-stage').props.style),
  ).toEqual(stage);
  expect(screen.getByText(long.text).props.numberOfLines).toBeUndefined();
  expect(screen.getByTestId('challenge-copy-scroll-long')).toBeTruthy();
  // Accepting the same challenge preserves the frame too.
  screen.unmount();
  const active = render(<ChallengeCard {...props} card={long} />);
  expect(
    StyleSheet.flatten(active.getByTestId('challenge-card').props.style),
  ).toMatchObject({
    width: frame.width,
    height: frame.height,
  });
});

it('preserves the flourish coordinate system when a queued card becomes the front card', async () => {
  const props = { venue: 'cafe', label: 'Cafe', onAction: async () => {} };
  const screen = render(<ChallengeDeck {...props} cards={cards} turn={0} />);
  await act(async () => {});
  const queued = screen.getByTestId('challenge-face-2', {
    includeHiddenElements: true,
  });
  const queuedFace = StyleSheet.flatten(queued.props.style);
  const queuedFlourish = screen.getByTestId('challenge-flourish-2', {
    includeHiddenElements: true,
  });
  const corner = StyleSheet.flatten(queuedFlourish.props.style);
  const back = StyleSheet.flatten(
    screen.getByTestId('challenge-back-2', { includeHiddenElements: true })
      .props.style,
  );
  // The reveal layer fills the frame; it cannot add another padding origin.
  expect(
    screen.getByTestId('challenge-reveal-2', { includeHiddenElements: true })
      .props.style,
  ).toContainEqual(StyleSheet.absoluteFill);
  expect(queuedFace).toMatchObject({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  screen.rerender(<ChallengeDeck {...props} cards={cards.slice(1)} turn={1} />);
  expect(
    StyleSheet.flatten(screen.getByTestId('challenge-face-2').props.style),
  ).toEqual(queuedFace);
  expect(
    StyleSheet.flatten(
      screen.getByTestId('challenge-flourish-2', {
        includeHiddenElements: true,
      }).props.style,
    ),
  ).toEqual(corner);
  expect(
    StyleSheet.flatten(screen.getByTestId('challenge-card').props.style),
  ).toMatchObject({ width: back.width, height: back.height });
});

it.each(['streets', 'park', 'gym', 'cafe', 'bookstore', 'bars'])(
  'uses cream accents on both darker %s cards and preserves them during promotion',
  async (venue) => {
    const props = { venue, label: venue, onAction: async () => {} };
    const screen = render(<ChallengeDeck {...props} cards={cards} turn={0} />);
    await act(async () => {});
    function accents(id: string) {
      const face = within(
        screen.getByTestId(`challenge-face-${id}`, {
          includeHiddenElements: true,
        }),
      );
      return {
        panel: face
          .UNSAFE_getAllByType(Path)
          .find((path) => path.props.d === panelOutline)!.props.fill,
        artwork: face.UNSAFE_getByType(VenueArt).props.background,
      };
    }
    expect(accents('1')).toEqual({ panel: '#FBE3CC', artwork: 'peach' });
    for (const [index, surface] of [
      [1, '#F9E3D0'],
      [2, '#FCD9B9'],
      [3, '#F8F0E9'],
    ] as const) {
      const id = cards[index]!.id;
      const queued = accents(id);
      expect(queued).toEqual(
        index === 3
          ? { panel: '#FBE3CC', artwork: 'peach' }
          : { panel: '#F8EFE7', artwork: 'cream' },
      );
      screen.rerender(
        <ChallengeDeck {...props} cards={cards.slice(index)} turn={index} />,
      );
      expect(accents(id)).toEqual(queued);
      expect(
        StyleSheet.flatten(screen.getByTestId('challenge-card').props.style)
          .backgroundColor,
      ).toBe(surface);
    }
  },
);
