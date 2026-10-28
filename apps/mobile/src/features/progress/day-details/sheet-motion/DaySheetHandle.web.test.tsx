import { fireEvent, render } from '@testing-library/react-native';
import { Animated, PanResponder } from 'react-native';
import { DaySheetHandle } from './DaySheetHandle.web';

type Controls = Parameters<typeof DaySheetHandle>[0]['controls'];

async function setup() {
  const controls = {
    height: new Animated.Value(400),
    expanded: false,
    canExpand: true,
    panHandlers: PanResponder.create({}).panHandlers,
    attachHandle: jest.fn(),
    toggle: jest.fn(),
    preparePress: jest.fn(),
    beginDrag: jest.fn(),
    moveDrag: jest.fn(),
    releaseDrag: jest.fn(),
    cancelDrag: jest.fn(),
    collapse: jest.fn(),
    expand: jest.fn(),
    onAvailableLayout: jest.fn(),
    onHeaderLayout: jest.fn(),
    onContentLayout: jest.fn(),
    onFirstRowHeightChange: jest.fn(),
  } satisfies Controls;
  const screen = await render(<DaySheetHandle controls={controls} />);
  const button = screen.container.queryAll(
    (node) => node.type === 'button',
  )[0]!;
  const setPointerCapture = jest.fn();
  const pointer = (
    overrides: Partial<{
      pointerId: number;
      isPrimary: boolean;
      button: number;
      clientX: number;
      clientY: number;
      timeStamp: number;
    }> = {},
  ) => ({
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: 195,
    clientY: 400,
    timeStamp: 0,
    currentTarget: { setPointerCapture },
    ...overrides,
  });
  return { screen, button, controls, pointer, setPointerCapture };
}

it('captures the primary pointer and forwards its vertical resize distance', async () => {
  const t = await setup();
  await fireEvent(t.button, 'pointerDown', t.pointer());
  expect(t.setPointerCapture).toHaveBeenCalledWith(1);
  expect(t.controls.beginDrag).toHaveBeenCalledTimes(1);
  await fireEvent(
    t.button,
    'pointerMove',
    t.pointer({ clientX: 197, clientY: 300, timeStamp: 100 }),
  );
  expect(t.controls.moveDrag).toHaveBeenLastCalledWith(-100);
  await fireEvent(
    t.button,
    'pointerUp',
    t.pointer({ clientX: 197, clientY: 300, timeStamp: 130 }),
  );
  expect(t.controls.releaseDrag).toHaveBeenCalledWith(-100);
  expect(t.controls.cancelDrag).not.toHaveBeenCalled();
  await t.screen.unmount();
});

it('accepts repeated drags after release', async () => {
  const t = await setup();
  await fireEvent(t.button, 'pointerDown', t.pointer());
  await fireEvent(
    t.button,
    'pointerMove',
    t.pointer({ clientY: 300, timeStamp: 100 }),
  );
  await fireEvent(
    t.button,
    'pointerUp',
    t.pointer({ clientY: 300, timeStamp: 120 }),
  );
  await fireEvent(t.button, 'lostPointerCapture', t.pointer());
  await fireEvent(
    t.button,
    'pointerDown',
    t.pointer({ pointerId: 2, clientY: 50, timeStamp: 200 }),
  );
  await fireEvent(
    t.button,
    'pointerMove',
    t.pointer({ pointerId: 2, clientY: 170, timeStamp: 300 }),
  );
  await fireEvent(
    t.button,
    'pointerUp',
    t.pointer({ pointerId: 2, clientY: 170, timeStamp: 400 }),
  );
  expect(t.setPointerCapture.mock.calls).toEqual([[1], [2]]);
  expect(t.controls.beginDrag).toHaveBeenCalledTimes(2);
  expect(t.controls.releaseDrag.mock.calls).toEqual([[-100], [120]]);
  expect(t.controls.cancelDrag).not.toHaveBeenCalled();
  await t.screen.unmount();
});

it('treats movement within the tap threshold as a click instead of a drag', async () => {
  const t = await setup();
  await fireEvent(t.button, 'pointerDown', t.pointer());
  await fireEvent(
    t.button,
    'pointerMove',
    t.pointer({ clientX: 198, clientY: 404, timeStamp: 100 }),
  );
  await fireEvent(
    t.button,
    'pointerUp',
    t.pointer({ clientX: 198, clientY: 404, timeStamp: 200 }),
  );
  expect(t.controls.moveDrag).not.toHaveBeenCalled();
  expect(t.controls.releaseDrag).toHaveBeenCalledWith(4);
  expect(t.controls.preparePress).toHaveBeenCalledTimes(2);
  expect(t.controls.toggle).not.toHaveBeenCalled();
  await fireEvent(t.button, 'click');
  expect(t.controls.toggle).toHaveBeenCalledTimes(1);
  await t.screen.unmount();
});

it('locks a horizontal gesture out of resizing even if it later moves vertically', async () => {
  const t = await setup();
  await fireEvent(t.button, 'pointerDown', t.pointer());
  await fireEvent(
    t.button,
    'pointerMove',
    t.pointer({ clientX: 275, clientY: 405, timeStamp: 100 }),
  );
  await fireEvent(
    t.button,
    'pointerMove',
    t.pointer({ clientX: 275, clientY: 600, timeStamp: 200 }),
  );
  await fireEvent(
    t.button,
    'pointerUp',
    t.pointer({ clientX: 275, clientY: 600, timeStamp: 220 }),
  );
  expect(t.controls.moveDrag).not.toHaveBeenCalled();
  expect(t.controls.releaseDrag).not.toHaveBeenCalled();
  expect(t.controls.cancelDrag).toHaveBeenCalledTimes(1);
  await t.screen.unmount();
});

it.each(['pointerCancel', 'lostPointerCapture'] as const)(
  'cancels the active gesture on %s and accepts a fresh pointer afterward',
  async (eventName) => {
    const t = await setup();
    await fireEvent(t.button, 'pointerDown', t.pointer());
    await fireEvent(t.button, eventName, t.pointer());
    await fireEvent(t.button, 'pointerUp', t.pointer());
    await fireEvent(t.button, 'lostPointerCapture', t.pointer());
    expect(t.controls.cancelDrag).toHaveBeenCalledTimes(1);
    expect(t.controls.releaseDrag).not.toHaveBeenCalled();
    await fireEvent(t.button, 'pointerDown', t.pointer({ pointerId: 3 }));
    await fireEvent(t.button, 'pointerUp', t.pointer({ pointerId: 3 }));
    expect(t.setPointerCapture.mock.calls).toEqual([[1], [3]]);
    expect(t.controls.releaseDrag).toHaveBeenCalledTimes(1);
    await t.screen.unmount();
  },
);

it.each([
  { isPrimary: false, button: 0 },
  { isPrimary: true, button: 2 },
])('ignores unsupported pointer starts: %s', async (start) => {
  const t = await setup();
  await fireEvent(t.button, 'pointerDown', t.pointer(start));
  await fireEvent(t.button, 'pointerMove', t.pointer({ clientY: 550 }));
  await fireEvent(t.button, 'pointerUp', t.pointer({ clientY: 550 }));
  expect(t.setPointerCapture).not.toHaveBeenCalled();
  expect(t.controls.beginDrag).not.toHaveBeenCalled();
  expect(t.controls.moveDrag).not.toHaveBeenCalled();
  expect(t.controls.releaseDrag).not.toHaveBeenCalled();
  await t.screen.unmount();
});

it.each(['pointerCancel', 'lostPointerCapture'] as const)(
  'ignores another pointer, including its %s, while the primary drag continues',
  async (eventName) => {
    const t = await setup();
    await fireEvent(t.button, 'pointerDown', t.pointer());
    const other = t.pointer({ pointerId: 2, isPrimary: false });
    await fireEvent(t.button, 'pointerDown', other);
    await fireEvent(t.button, 'pointerMove', { ...other, clientY: 550 });
    await fireEvent(t.button, 'pointerUp', other);
    await fireEvent(t.button, eventName, other);
    expect(t.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(t.controls.beginDrag).toHaveBeenCalledTimes(1);
    expect(t.controls.moveDrag).not.toHaveBeenCalled();
    expect(t.controls.releaseDrag).not.toHaveBeenCalled();
    expect(t.controls.cancelDrag).not.toHaveBeenCalled();
    await fireEvent(
      t.button,
      'pointerMove',
      t.pointer({ clientY: 300, timeStamp: 100 }),
    );
    await fireEvent(
      t.button,
      'pointerUp',
      t.pointer({ clientY: 300, timeStamp: 120 }),
    );
    expect(t.controls.releaseDrag).toHaveBeenCalledWith(-100);
    await t.screen.unmount();
  },
);

it('supports Enter and Space activation without starting a pointer gesture', async () => {
  const t = await setup();
  await fireEvent(t.button, 'keyDown', { key: 'Escape' });
  expect(t.controls.preparePress).not.toHaveBeenCalled();
  for (const key of ['Enter', ' ']) {
    await fireEvent(t.button, 'keyDown', { key });
    await fireEvent(t.button, 'click');
  }
  expect(t.controls.preparePress).toHaveBeenCalledTimes(2);
  expect(t.controls.toggle).toHaveBeenCalledTimes(2);
  expect(t.controls.beginDrag).not.toHaveBeenCalled();
  expect(t.setPointerCapture).not.toHaveBeenCalled();
  await t.screen.unmount();
});
