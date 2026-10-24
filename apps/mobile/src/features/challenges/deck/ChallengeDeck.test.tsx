import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { cancelAnimation, withTiming } from 'react-native-reanimated';
import { ChallengeCard, ChallengeDeck } from './ChallengeDeck';
import { panelOutline } from '../challenge-design';
import { colors } from '../../../theme/tokens';
const artworkSources = {
  streets: {
    peach: require('../../../../assets/challenges/streets.png'),
    cream: require('../../../../assets/challenges/streets-cream.png'),
  },
  park: {
    peach: require('../../../../assets/challenges/park.png'),
    cream: require('../../../../assets/challenges/park-cream.png'),
  },
  gym: {
    peach: require('../../../../assets/challenges/gym.png'),
    cream: require('../../../../assets/challenges/gym-cream.png'),
  },
  cafe: {
    peach: require('../../../../assets/challenges/cafe.png'),
    cream: require('../../../../assets/challenges/cafe-cream.png'),
  },
  bookstore: {
    peach: require('../../../../assets/challenges/bookstore.png'),
    cream: require('../../../../assets/challenges/bookstore-cream.png'),
  },
  bars: {
    peach: require('../../../../assets/challenges/bars.png'),
    cream: require('../../../../assets/challenges/bars-cream.png'),
  },
} as const;
type PanEvent = {
  translationX: number;
  translationY: number;
  velocityX: number;
};
let mockPanCallbacks: Record<
  string,
  (event: PanEvent, success?: boolean) => void
> = {};
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
      g[name] = (value: unknown) => {
        if (name.startsWith('on'))
          mockPanCallbacks[name] = value as (typeof mockPanCallbacks)[string];
        return g;
      };
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
    withTiming: jest.fn(
      (to: unknown, _config: unknown, callback?: (done: boolean) => void) => {
        callback?.(true);
        return to;
      },
    ),
  };
});
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (
    callback: (...mockArgs: unknown[]) => void,
    ...args: unknown[]
  ) => callback(...args),
}));
let mockReduceMotion = false;
jest.mock('../../../platform/motion/motion', () => ({
  useReduceMotion: () => mockReduceMotion,
}));
beforeEach(() => {
  mockReduceMotion = false;
  mockPanCallbacks = {};
});
const cards = [
  { id: '1', text: 'Say hello.' },
  { id: '2', text: 'Ask a question.' },
  { id: '3', text: 'Give a compliment.' },
  { id: '4', text: 'Ask for a recommendation.' },
];

it.each(['layout', 'illustration', 'texture'] as const)(
  'waits for the front card’s %s before reporting visual readiness',
  async (last) => {
    const ready = jest.fn();
    const screen = await render(
      <ChallengeDeck
        cards={cards}
        venue="cafe"
        label="Cafe"
        turn={0}
        onAction={async () => {}}
        onVisualReady={ready}
      />,
    );
    const front = screen.getByTestId('challenge-card');
    const settle = {
      layout: async () =>
        await fireEvent(front, 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width: 220, height: 273 } },
        }),
      illustration: async () =>
        await fireEvent(
          within(front).getByTestId('challenge-illustration', {
            includeHiddenElements: true,
          }),
          'load',
        ),
      texture: async () =>
        await fireEvent(
          within(front).getByTestId('challenge-paper-texture', {
            includeHiddenElements: true,
          }),
          'load',
        ),
    };
    for (const [name, finish] of Object.entries(settle))
      if (name !== last) await finish();
    expect(ready).not.toHaveBeenCalled();
    await settle[last]();
    expect(ready).toHaveBeenCalledTimes(1);
    for (const finish of Object.values(settle)) await finish();
    expect(ready).toHaveBeenCalledTimes(1);
    await screen.rerender(
      <ChallengeDeck
        cards={cards.slice(1)}
        venue="cafe"
        label="Cafe"
        turn={1}
        onAction={async () => {}}
        onVisualReady={ready}
      />,
    );
    expect(ready).toHaveBeenCalledTimes(1);
  },
);

jest.mock('react-native-svg', () =>
  jest.requireActual('../../../../test-support/svg'),
);

it('ignores queued-card readiness and settles failed decorative assets after a nonempty front layout', async () => {
  const ready = jest.fn();
  const screen = await render(
    <ChallengeDeck
      cards={cards}
      venue="cafe"
      label="Cafe"
      turn={0}
      onAction={async () => {}}
      onVisualReady={ready}
    />,
  );
  const layout = async (
    node: ReturnType<typeof screen.getByTestId>,
    width: number,
  ) =>
    await fireEvent(node, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height: 273 } },
    });
  const settleAssets = async (node: ReturnType<typeof screen.getByTestId>) => {
    for (const id of ['challenge-illustration', 'challenge-paper-texture'])
      await fireEvent(
        within(node).getByTestId(id, { includeHiddenElements: true }),
        'error',
      );
  };
  const queued = screen.getByTestId('challenge-back-2', {
    includeHiddenElements: true,
  });
  await layout(queued, 220);
  await settleAssets(queued);
  expect(ready).not.toHaveBeenCalled();
  const front = screen.getByTestId('challenge-card');
  await settleAssets(front);
  await layout(front, 0);
  expect(ready).not.toHaveBeenCalled();
  await layout(front, 220);
  expect(ready).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  'preserves swipes and removes automatic travel when motion is reduced: %s',
  async (reduced) => {
    mockReduceMotion = reduced;
    jest.mocked(withTiming).mockClear();
    const onAction = jest.fn(async () => 1);
    const props = { venue: 'cafe', label: 'Cafe', onAction };
    const screen = await render(
      <ChallengeDeck {...props} cards={cards} turn={0} />,
    );
    const short = { translationX: 20, translationY: 10, velocityX: 0 };
    await act(() => {
      mockPanCallbacks.onUpdate!(short);
      mockPanCallbacks.onEnd!(short);
      mockPanCallbacks.onFinalize!(short, false);
    });
    expect(withTiming).toHaveBeenCalledTimes(reduced ? 0 : 2);
    expect(onAction).not.toHaveBeenCalled();
    jest.mocked(withTiming).mockClear();
    await act(async () =>
      mockPanCallbacks.onEnd!({
        translationX: -100,
        translationY: 0,
        velocityX: 0,
      }),
    );
    expect(onAction).toHaveBeenCalledWith(-1);
    await screen.rerender(
      <ChallengeDeck {...props} cards={cards.slice(1)} turn={1} />,
    );
    expect(
      screen.getByRole('button', { name: 'Skip challenge' }),
    ).toBeEnabled();
    expect(withTiming).toHaveBeenCalledTimes(reduced ? 0 : 1);
  },
);

it('finishes acceptance when a reduced-motion change cancels its in-flight exit', async () => {
  let finish!: (done: boolean) => void;
  jest.mocked(withTiming).mockImplementationOnce((to, _config, callback) => {
    finish = callback!;
    return to;
  });
  jest.mocked(cancelAnimation).mockImplementation(() => finish(false));
  const onAction = jest.fn(async () => 0);
  const props = { cards, venue: 'cafe', label: 'Cafe', turn: 0, onAction };
  const screen = await render(<ChallengeDeck {...props} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Accept challenge' }),
  );
  expect(onAction).not.toHaveBeenCalled();
  mockReduceMotion = true;
  await screen.rerender(<ChallengeDeck {...props} />);
  await act(async () => {});
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(onAction).toHaveBeenCalledWith(1);
  expect(
    screen.getByRole('button', { name: 'Accept challenge' }),
  ).toBeEnabled();
  await screen.unmount();
  jest.mocked(cancelAnimation).mockReset();
});
it.each([false, true])(
  'holds the accepted deck until the active surface closes (reduced motion: %s)',
  async (reduced) => {
    mockReduceMotion = reduced;
    jest.mocked(withTiming).mockClear();
    const onBusyChange = jest.fn();
    let confirm!: (turn: number) => void;
    const onAction = jest.fn(
      () =>
        new Promise<number>((resolve) => {
          confirm = resolve;
        }),
    );
    const props = {
      cards,
      venue: 'cafe',
      label: 'Cafe',
      onBusyChange,
      onAction,
    };
    const screen = await render(<ChallengeDeck {...props} turn={0} />);
    await act(async () => {});
    await fireEvent.press(
      screen.getByRole('button', { name: 'Accept challenge' }),
    );
    // The parent opens the modal without advancing the browsing queue.
    await screen.rerender(
      <ChallengeDeck {...props} turn={0} covered disabled />,
    );
    await act(() => confirm(0));
    expect(onAction).toHaveBeenCalledWith(1);
    expect(withTiming).toHaveBeenCalledTimes(reduced ? 0 : 1);
    expect(onBusyChange.mock.calls).toEqual([[true]]);
    expect(
      screen.getByRole('button', { name: 'Accept challenge' }),
    ).toBeDisabled();
    // Give up advances the queue and uncovers the existing deck; input works
    // again without a return animation of the accepted card.
    await screen.rerender(
      <ChallengeDeck {...props} cards={cards.slice(1)} turn={1} />,
    );
    expect(
      screen.getByRole('button', { name: 'Accept challenge' }),
    ).toBeEnabled();
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
    expect(withTiming).toHaveBeenCalledTimes(reduced ? 0 : 1);
    await screen.unmount();
  },
);
it('restores an unconfirmed action so the same card can be tried again', async () => {
  mockReduceMotion = false;
  jest.mocked(withTiming).mockClear();
  const action = jest.fn(async () => 0);
  const screen = await render(
    <ChallengeDeck
      cards={cards}
      venue="cafe"
      label="Cafe"
      turn={0}
      onAction={action}
    />,
  );
  await act(async () => {});
  await fireEvent.press(screen.getByRole('button', { name: 'Skip challenge' }));
  await act(async () => {});
  expect(withTiming).toHaveBeenCalledTimes(2);
  expect(jest.mocked(withTiming).mock.calls[1]![0]).toMatchObject({
    x: 0,
    progress: 0,
  });
  expect(
    screen.getByRole('button', { name: 'Accept challenge' }),
  ).toBeEnabled();
  await screen.unmount();
});
it.each([0, 1, 2, 5])(
  'preserves the full deck theme on acceptance at turn %s',
  async (turn) => {
    const props = { venue: 'cafe', label: 'Cafe', turn };
    const deck = await render(
      <ChallengeDeck {...props} cards={cards} onAction={async () => {}} />,
    );
    await act(async () => {});
    const surface = StyleSheet.flatten(
      deck.getByTestId('challenge-card').props.style,
    ).backgroundColor;
    const accent = deck
      .getByTestId('challenge-face-1')
      .queryAll((node) => node.type === 'Path')
      .find((path) => path.props.d === panelOutline)!.props.fill;
    const artwork = within(deck.getByTestId('challenge-face-1')).getByTestId(
      'challenge-illustration',
      { includeHiddenElements: true },
    ).props.source;
    await deck.unmount();
    const activeCard = await render(
      <ChallengeCard {...props} card={cards[0]!} />,
    );
    expect(
      StyleSheet.flatten(activeCard.getByTestId('challenge-card').props.style)
        .backgroundColor,
    ).toBe(surface);
    expect(
      activeCard.container
        .queryAll((node) => node.type === 'Path')
        .find((path) => path.props.d === panelOutline)!.props.fill,
    ).toBe(accent);
    expect(
      activeCard.getByTestId('challenge-illustration', {
        includeHiddenElements: true,
      }).props.source,
    ).toBe(artwork);
  },
);
it('uses the same cream surface for the light card as the challenge page', async () => {
  const screen = await render(
    <ChallengeCard card={cards[0]!} venue="cafe" label="Cafe" />,
  );
  expect(
    StyleSheet.flatten(screen.getByTestId('challenge-card').props.style)
      .backgroundColor,
  ).toBe(colors.cream);
});
it('keeps button input exclusive while the same confirmed action is pending', async () => {
  mockReduceMotion = true;
  let finish!: () => void;
  const action = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const screen = await render(
    <ChallengeDeck
      cards={cards}
      venue="cafe"
      label="Cafe"
      turn={0}
      onAction={action}
    />,
  );
  await act(async () => {});
  await fireEvent.press(screen.getByRole('button', { name: 'Skip challenge' }));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Accept challenge' }),
  );
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(action).toHaveBeenCalledWith(-1);
  expect(
    screen.getByRole('button', { name: 'Accept challenge' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  // Saving still blocks duplicate input, but does not flash both controls pale.
  await screen.rerender(
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
  await screen.rerender(
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
it('keeps action buttons fully opaque during a background refresh', async () => {
  const screen = await render(
    <ChallengeDeck
      cards={cards}
      venue="cafe"
      label="Cafe"
      turn={0}
      disabled
      onAction={async () => {}}
    />,
  );
  await act(async () => {});
  for (const name of ['Skip challenge', 'Accept challenge']) {
    const button = screen.getByRole('button', { name });
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(StyleSheet.flatten(button.props.style).opacity ?? 1).toBe(1);
  }
});
it('hides queued content from screen readers and renders no duplicate cards for a one-card queue', async () => {
  const screen = await render(
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
  await screen.rerender(
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
  mockReduceMotion = false;
  let finishExit!: (finished: boolean) => void;
  jest.mocked(withTiming).mockImplementationOnce((to, _config, finish) => {
    finishExit = finish!;
    return to;
  });
  const action = jest.fn(async () => {});
  const screen = await render(
    <ChallengeDeck
      cards={cards}
      venue="cafe"
      label="Cafe"
      turn={0}
      onAction={action}
    />,
  );
  await act(async () => {});
  await fireEvent.press(
    screen.getByRole('button', { name: 'Accept challenge' }),
  );
  expect(action).not.toHaveBeenCalled();
  expect(finishExit).toEqual(expect.any(Function));
  await screen.unmount();
  await act(() => finishExit(true));
  expect(action).not.toHaveBeenCalled();
});

it('keeps the frame and action area stable when short and long challenges advance', async () => {
  const long = {
    id: 'long',
    text: 'Ask someone nearby for a recommendation for a place they enjoy visiting in the neighborhood.',
  };
  const props = { venue: 'cafe', label: 'Cafe', onAction: async () => {} };
  const screen = await render(
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
  await screen.rerender(
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
  await screen.unmount();
  const active = await render(<ChallengeCard {...props} card={long} />);
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
])('uses the regular type treatment for catalog copy: %s', async (text) => {
  const screen = await render(
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

it('reserves room for four lines of regular challenge copy', async () => {
  const card = {
    id: 'four-lines',
    text: 'Ask someone nearby where they like to go when they need a quiet break.',
  };
  const screen = await render(
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
  async (venue, offset) => {
    const screen = await render(
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
  const screen = await render(
    <ChallengeDeck {...props} cards={cards} turn={0} />,
  );
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
  await screen.rerender(
    <ChallengeDeck {...props} cards={cards.slice(1)} turn={1} />,
  );
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
  mockReduceMotion = true;
  const action = jest.fn(async () => 1);
  const props = { venue: 'cafe', label: 'Cafe', onAction: action };
  const screen = await render(
    <ChallengeDeck {...props} cards={cards} turn={0} />,
  );
  await act(async () => {});
  const queued = screen.getByTestId('challenge-face-2', {
    includeHiddenElements: true,
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Skip challenge' }));
  await act(async () => {});
  // A resolved save is not proof that React has committed its new queue yet.
  expect(screen.getByRole('button', { name: 'Skip challenge' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Skip challenge' }));
  expect(action).toHaveBeenCalledTimes(1);
  await screen.rerender(
    <ChallengeDeck {...props} cards={cards.slice(1)} turn={1} />,
  );
  expect(screen.getByTestId('challenge-face-2')).toBe(queued);
  expect(
    screen.getByRole('button', { name: 'Skip challenge' }),
  ).not.toBeDisabled();
});

it('restores the original card when a save does not advance the queue', async () => {
  mockReduceMotion = false;
  const screen = await render(
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
  await fireEvent.press(screen.getByRole('button', { name: 'Skip challenge' }));
  await act(async () => {});
  expect(screen.getByTestId('challenge-face-1')).toBe(original);
  expect(
    screen.getByRole('button', { name: 'Skip challenge' }),
  ).not.toBeDisabled();
});

it.each(['streets', 'park', 'gym', 'cafe', 'bookstore', 'bars'] as const)(
  'uses cream accents on both darker %s cards and preserves them during promotion',
  async (venue) => {
    const props = { venue, label: venue, onAction: async () => {} };
    const screen = await render(
      <ChallengeDeck {...props} cards={cards} turn={0} />,
    );
    await act(async () => {});
    function accents(id: string) {
      const face = screen.getByTestId(`challenge-face-${id}`, {
        includeHiddenElements: true,
      });
      return {
        panel: face
          .queryAll((node) => node.type === 'Path')
          .find((path) => path.props.d === panelOutline)!.props.fill,
        artwork: within(face).getByTestId('challenge-illustration', {
          includeHiddenElements: true,
        }).props.source,
      };
    }
    expect(accents('1')).toEqual({
      panel: '#FBE3CC',
      artwork: artworkSources[venue].peach,
    });
    for (const [index, surface] of [
      [1, '#F9E3D0'],
      [2, '#FCD9B9'],
      [3, colors.cream],
    ] as const) {
      const id = cards[index]!.id;
      const queued = accents(id);
      expect(queued).toEqual(
        index === 3
          ? { panel: '#FBE3CC', artwork: artworkSources[venue].peach }
          : { panel: '#F8EFE7', artwork: artworkSources[venue].cream },
      );
      await screen.rerender(
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
