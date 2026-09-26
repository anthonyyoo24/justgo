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
import { colors } from '../../theme/tokens';
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
it.each([0, 1, 2, 5])(
  'preserves the full deck theme on acceptance at turn %s',
  async (turn) => {
    const props = { venue: 'cafe', label: 'Cafe', turn };
    const deck = render(
      <ChallengeDeck {...props} cards={cards} onAction={async () => {}} />,
    );
    await act(async () => {});
    const surface = StyleSheet.flatten(
      deck.getByTestId('challenge-card').props.style,
    ).backgroundColor;
    const accent = within(deck.getByTestId('challenge-face-1'))
      .UNSAFE_getAllByType(Path)
      .find((path) => path.props.d === panelOutline)!.props.fill;
    const artwork = within(
      deck.getByTestId('challenge-face-1'),
    ).UNSAFE_getByType(VenueArt).props.background;
    deck.unmount();
    const activeCard = render(<ChallengeCard {...props} card={cards[0]!} />);
    expect(
      StyleSheet.flatten(activeCard.getByTestId('challenge-card').props.style)
        .backgroundColor,
    ).toBe(surface);
    expect(
      activeCard
        .UNSAFE_getAllByType(Path)
        .find((path) => path.props.d === panelOutline)!.props.fill,
    ).toBe(accent);
    expect(activeCard.UNSAFE_getByType(VenueArt).props.background).toBe(
      artwork,
    );
  },
);
it('uses the same cream surface for the light card as the challenge page', () => {
  const screen = render(
    <ChallengeCard card={cards[0]!} venue="cafe" label="Cafe" />,
  );
  expect(
    StyleSheet.flatten(screen.getByTestId('challenge-card').props.style)
      .backgroundColor,
  ).toBe(colors.cream);
});
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
  // Saving still blocks duplicate input, but does not flash both controls pale.
  screen.rerender(
    <ChallengeDeck
      cards={cards}
      venue="cafe"
      label="Cafe"
      turn={0}
      disabled
      onAction={action}
    />,
  );
  for (const name of ['Skip challenge', 'Accept challenge']) {
    expect(
      StyleSheet.flatten(screen.getByRole('button', { name }).props.style)
        .opacity ?? 1,
    ).toBe(1);
  }
  screen.rerender(
    <ChallengeDeck
      cards={cards}
      venue="cafe"
      label="Cafe"
      turn={0}
      onAction={action}
    />,
  );
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
  const scale = frame.width / 220;
  expect(frame.height).toBe(273 * scale);
  expect((stage.height - frame.height) / 2 + stage.marginBottom).toBeCloseTo(
    32 * scale + 8,
  );
  expect(
    StyleSheet.flatten(screen.getByTestId('challenge-action-space').props.style)
      .justifyContent,
  ).toBe('flex-start');
  expect(
    StyleSheet.flatten(screen.getByText(cards[0]!.text).props.style).fontSize,
  ).toBe(20 * scale);
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
  expect(
    StyleSheet.flatten(screen.getByText(long.text).props.style).fontSize,
  ).toBe(20 * scale);
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

it.each([
  'Comment on the song to someone beside you on the dance floor.',
  'Ask someone sitting beside you to watch your things while you use the bathroom.',
])('uses the regular type treatment for catalog copy: %s', (text) => {
  const screen = render(
    <ChallengeCard card={{ id: 'catalog', text }} venue="cafe" label="Cafe" />,
  );
  const frame = StyleSheet.flatten(
    screen.getByTestId('challenge-card').props.style,
  );
  const scale = frame.width / 220;
  expect(StyleSheet.flatten(screen.getByText(text).props.style)).toMatchObject({
    fontSize: 20 * scale,
    lineHeight: 23 * scale,
    padding: 10 * scale,
  });
});

it('reserves room for four lines of regular challenge copy', () => {
  const card = {
    id: 'four-lines',
    text: 'Ask someone nearby where they like to go when they need a quiet break.',
  };
  const screen = render(
    <ChallengeCard card={card} venue="cafe" label="Cafe" />,
  );
  const frame = StyleSheet.flatten(
    screen.getByTestId('challenge-card').props.style,
  );
  const face = StyleSheet.flatten(
    screen.getByTestId('challenge-face-four-lines').props.style,
  );
  const copy = StyleSheet.flatten(screen.getByText(card.text).props.style);
  const scale = frame.width / 220;
  const available =
    frame.height -
    Number(face.paddingTop) -
    Number(face.paddingBottom) -
    3 * Number(face.gap) -
    (14 + 63 + 27) * scale;
  const needed = 4 * Number(copy.lineHeight) + 2 * Number(copy.padding);

  expect(copy.fontSize).toBe(20 * scale);
  expect(available).toBeGreaterThanOrEqual(needed + 4 * scale);
});

it.each([
  ['streets', 2.875],
  ['park', -2.625],
  ['gym', 1.125],
  ['cafe', 6.75],
  ['bookstore', 0.875],
  ['bars', -0.875],
] as const)(
  'centers the drawn %s artwork with the venue and copy',
  (venue, offset) => {
    const screen = render(
      <ChallengeCard card={cards[0]!} venue={venue} label={venue} />,
    );
    const face = StyleSheet.flatten(
      screen.getByTestId('challenge-face-1').props.style,
    );
    const art = StyleSheet.flatten(
      screen.getByTestId('challenge-illustration', {
        includeHiddenElements: true,
      }).props.style,
    );
    const copy = StyleSheet.flatten(
      screen.getByTestId('challenge-copy-panel').props.style,
    );
    const frame = StyleSheet.flatten(
      screen.getByTestId('challenge-card').props.style,
    );
    expect(face.alignItems).toBe('center');
    expect(copy.maxWidth).toBe('100%');
    expect(art.transform[0].translateX).toBeCloseTo(
      offset * (frame.width / 220),
    );
  },
);

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
  // Keep the native face and its image instances mounted through promotion.
  expect(screen.getByTestId('challenge-face-2')).toBe(queued);
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

it('holds the promoted stack and locks input until the acknowledged queue is rendered', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  const action = jest.fn(async () => 1);
  const props = { venue: 'cafe', label: 'Cafe', onAction: action };
  const screen = render(<ChallengeDeck {...props} cards={cards} turn={0} />);
  await act(async () => {});
  const queued = screen.getByTestId('challenge-face-2', {
    includeHiddenElements: true,
  });
  fireEvent.press(screen.getByRole('button', { name: 'Skip challenge' }));
  await act(async () => {});
  // A resolved save is not proof that React has committed its new queue yet.
  expect(screen.getByRole('button', { name: 'Skip challenge' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Skip challenge' }));
  expect(action).toHaveBeenCalledTimes(1);
  screen.rerender(<ChallengeDeck {...props} cards={cards.slice(1)} turn={1} />);
  expect(screen.getByTestId('challenge-face-2')).toBe(queued);
  expect(
    screen.getByRole('button', { name: 'Skip challenge' }),
  ).not.toBeDisabled();
});

it('restores the original card when a save does not advance the queue', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  const screen = render(
    <ChallengeDeck
      cards={cards}
      venue="cafe"
      label="Cafe"
      turn={8}
      onAction={async () => 8}
    />,
  );
  await act(async () => {});
  const original = screen.getByTestId('challenge-face-1');
  fireEvent.press(screen.getByRole('button', { name: 'Skip challenge' }));
  await act(async () => {});
  expect(screen.getByTestId('challenge-face-1')).toBe(original);
  expect(
    screen.getByRole('button', { name: 'Skip challenge' }),
  ).not.toBeDisabled();
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
      [3, colors.cream],
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
