import { clearBackupFiles, pickBackupFile } from './backup-file.web';

const originalDocument = globalThis.document;
const events = new Map<string, () => void>();
const arrayBuffer = jest.fn();
const slice = jest.fn(() => ({ arrayBuffer }));
const input = {
  type: '',
  accept: '',
  style: { display: '' },
  files: [{ size: 4, slice }],
  addEventListener: (name: string, callback: () => void) =>
    events.set(name, callback),
  click: jest.fn(),
  remove: jest.fn(),
};
beforeEach(() => {
  jest.clearAllMocks();
  events.clear();
  input.files = [{ size: 4, slice }];
  arrayBuffer.mockResolvedValue(new Uint8Array([80, 75, 3, 4]).buffer);
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => input, body: { appendChild: jest.fn() } },
  });
});
afterAll(() =>
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: originalDocument,
  }),
);
const run = (check = jest.fn(), signal = new AbortController().signal) =>
  pickBackupFile(100, check, signal);

it('opens a ZIP picker from the user action and reads a bounded file slice', async () => {
  const pending = run();
  expect(input.click).toHaveBeenCalledTimes(1);
  expect(input.accept).toContain('.zip');
  events.get('change')?.();
  await expect(pending).resolves.toEqual(new Uint8Array([80, 75, 3, 4]));
  expect(slice).toHaveBeenCalledWith(0, 101);
  expect(input.remove).toHaveBeenCalledTimes(1);
});

it.each(['cancel', 'empty'] as const)(
  'settles %s selection without a journal import',
  async (caseName) => {
    const pending = run();
    input.files = [];
    events.get(caseName === 'cancel' ? 'cancel' : 'change')?.();
    await expect(pending).resolves.toBeNull();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(input.remove).toHaveBeenCalledTimes(1);
  },
);

it('aborts an open picker and releases its input', async () => {
  const abort = new AbortController();
  const pending = run(jest.fn(), abort.signal);
  abort.abort();
  await expect(pending).resolves.toBeNull();
  expect(input.remove).toHaveBeenCalledTimes(1);
});

it('does not mount a picker for an aborted action', async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(run(jest.fn(), abort.signal)).resolves.toBeNull();
  expect(input.click).not.toHaveBeenCalled();
});

it.each(['file', 'read'] as const)(
  'rejects an oversized %s before resolving private bytes',
  async (source) => {
    if (source === 'file') input.files = [{ size: 101, slice }];
    if (source === 'read')
      arrayBuffer.mockResolvedValue(new Uint8Array(101).buffer);
    const pending = run();
    events.get('change')?.();
    await expect(pending).rejects.toThrow('size limit');
    expect(input.remove).toHaveBeenCalledTimes(1);
    if (source === 'file') expect(arrayBuffer).not.toHaveBeenCalled();
  },
);

it('propagates read failures and releases the input', async () => {
  arrayBuffer.mockRejectedValue(new Error('File unreadable'));
  const pending = run();
  events.get('change')?.();
  await expect(pending).rejects.toThrow('File unreadable');
  expect(input.remove).toHaveBeenCalledTimes(1);
});

it('fences an account change before reading the chosen file', async () => {
  const check = jest
    .fn()
    .mockImplementationOnce(() => {})
    .mockImplementation(() => {
      throw new Error('Account changed');
    });
  const pending = run(check);
  events.get('change')?.();
  await expect(pending).rejects.toThrow('Account changed');
  expect(arrayBuffer).not.toHaveBeenCalled();
});

it('settles cancellation while a file read is still pending', async () => {
  let finish!: (bytes: ArrayBuffer) => void;
  arrayBuffer.mockReturnValue(
    new Promise<ArrayBuffer>((resolve) => {
      finish = resolve;
    }),
  );
  const abort = new AbortController();
  const pending = run(jest.fn(), abort.signal);
  events.get('change')?.();
  abort.abort();
  await expect(pending).resolves.toBeNull();
  finish(new Uint8Array([1]).buffer);
  await Promise.resolve();
  expect(input.remove).toHaveBeenCalledTimes(1);
});

it('cleans up when the browser refuses the picker', async () => {
  input.click.mockImplementationOnce(() => {
    throw new Error('Picker unavailable');
  });
  await expect(run()).rejects.toThrow('Picker unavailable');
  expect(input.remove).toHaveBeenCalledTimes(1);
});

it('requires no browser cache-file cleanup', () => {
  expect(() => clearBackupFiles()).not.toThrow();
});
