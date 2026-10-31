import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureWorkerCpuProfile,
  workerCpuProfileFailureStage,
} from '../../scripts/workers-cpu-profile.js';

const origin = 'http://127.0.0.1:9230';
const debuggerUrl = 'ws://127.0.0.1:9230/ws';
const profile = {
  nodes: [
    {
      id: 1,
      callFrame: {
        functionName: 'fetch',
        scriptId: '1',
        url: 'file:///synthetic/worker.js',
        lineNumber: 1,
        columnNumber: 0,
      },
      hitCount: 1,
    },
  ],
  startTime: 100,
  endTime: 200,
  samples: [1],
  timeDeltas: [100],
};

class FakeInspector extends EventTarget {
  readyState: number = WebSocket.OPEN;
  commands: string[] = [];
  omit?: string;
  errorAt?: string;
  invalidMessage?: string;
  workerdAcknowledgments = false;
  profile: unknown = profile;
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (listener) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    if (listener) this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }

  send = vi.fn((data: string) => {
    const command = JSON.parse(data) as { id: number; method: string };
    this.commands.push(command.method);
    if (command.method === this.omit) return;
    queueMicrotask(() => {
      if (this.errorAt === command.method) {
        this.dispatchEvent(new Event('error'));
        return;
      }
      this.dispatchEvent(
        new MessageEvent('message', {
          data:
            this.invalidMessage ??
            JSON.stringify({
              id: command.id,
              ...(this.workerdAcknowledgments &&
              command.method !== 'Profiler.stop'
                ? { method: command.method, params: {} }
                : {
                    result:
                      command.method === 'Profiler.stop'
                        ? { profile: this.profile }
                        : {},
                  }),
            }),
        }),
      );
    });
  });

  close = vi.fn(() => {
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  });

  get listenerCount() {
    return [...this.listeners.values()].reduce(
      (count, listeners) => count + listeners.size,
      0,
    );
  }
}

function fixture(socket = new FakeInspector(), url = debuggerUrl) {
  return {
    socket,
    request: vi.fn<typeof fetch>(async () =>
      Response.json([{ webSocketDebuggerUrl: url }]),
    ),
    connect: vi.fn(() => socket as unknown as WebSocket),
  };
}

describe('owned local Worker CPU capture', () => {
  afterEach(() => vi.useRealTimers());

  it('discovers only the loopback inspector, brackets the workload and saves only CPU fields', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.socket.profile = { ...profile, providerLog: 'PRIVATE_CONTENT' };
    const workload = vi.fn(async (signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      expect(f.socket.commands).toEqual(['Profiler.enable', 'Profiler.start']);
      f.socket.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            method: 'Runtime.event',
            params: 'PRIVATE_CONTENT',
          }),
        }),
      );
    });
    expect(await captureWorkerCpuProfile(origin, workload, f)).toEqual(profile);
    expect(f.request).toHaveBeenCalledWith(new URL(`${origin}/json/list`), {
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
    expect(f.connect).toHaveBeenCalledExactlyOnceWith(debuggerUrl, {
      headers: { Origin: origin },
    });
    expect(workload).toHaveBeenCalledOnce();
    expect(f.socket.commands).toEqual([
      'Profiler.enable',
      'Profiler.start',
      'Profiler.stop',
    ]);
    expect(f.socket.close).toHaveBeenCalledOnce();
    expect(f.socket.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'https://127.0.0.1:9230',
    'http://remote.invalid:9230',
    'http://localhost:9230',
    'http://127.0.0.1:80',
    'http://127.0.0.1:9230/other',
    'http://user:PRIVATE_CONTENT@127.0.0.1:9230',
    'http://127.0.0.1:9230/?token=PRIVATE_CONTENT',
    'http://127.0.0.1:9230/#PRIVATE_CONTENT',
  ])('rejects unsafe discovery origin %s before I/O', async (url) => {
    const f = fixture();
    await expect(
      captureWorkerCpuProfile(url, async () => {}, f),
    ).rejects.toThrow(/^Worker CPU profile failed$/);
    expect(f.request).not.toHaveBeenCalled();
    expect(f.connect).not.toHaveBeenCalled();
  });

  it('accepts pinned workerd acknowledgments that echo empty params without a result', async () => {
    const f = fixture();
    f.socket.workerdAcknowledgments = true;
    expect(await captureWorkerCpuProfile(origin, async () => {}, f)).toEqual(
      profile,
    );
    expect(f.socket.commands).toEqual([
      'Profiler.enable',
      'Profiler.start',
      'Profiler.stop',
    ]);
    expect(f.socket.close).toHaveBeenCalledOnce();
  });

  it.each([
    'wss://127.0.0.1:9230/ws',
    'ws://remote.invalid:9230/ws',
    'ws://localhost:9230/ws',
    'ws://127.0.0.1:9231/ws',
    'ws://127.0.0.1:9230/other',
    'ws://user:PRIVATE_CONTENT@127.0.0.1:9230/ws',
    'ws://127.0.0.1:9230/ws?token=PRIVATE_CONTENT',
    'ws://127.0.0.1:9230/ws#PRIVATE_CONTENT',
  ])('rejects unsafe discovered socket %s before connecting', async (url) => {
    const f = fixture(new FakeInspector(), url);
    await expect(
      captureWorkerCpuProfile(origin, async () => {}, f),
    ).rejects.toThrow(/^Worker CPU profile failed$/);
    expect(f.connect).not.toHaveBeenCalled();
  });

  it.each([
    { targets: [] },
    { targets: [{}, {}] },
    { targets: [{ webSocketDebuggerUrl: 42 }] },
  ])(
    'rejects missing, ambiguous or malformed discovery',
    async ({ targets }) => {
      const f = fixture();
      f.request.mockResolvedValue(Response.json(targets));
      await expect(
        captureWorkerCpuProfile(origin, async () => {}, f),
      ).rejects.toThrow(/^Worker CPU profile failed$/);
      expect(f.connect).not.toHaveBeenCalled();
    },
  );

  it('rejects discovery HTTP failure without opening a socket', async () => {
    const f = fixture();
    f.request.mockResolvedValue(
      new Response('PRIVATE_CONTENT', { status: 503 }),
    );
    await expect(
      captureWorkerCpuProfile(origin, async () => {}, f),
    ).rejects.toThrow(/^Worker CPU profile failed$/);
    expect(f.connect).not.toHaveBeenCalled();
  });

  it.each([
    'opening',
    'Profiler.enable',
    'Profiler.start',
    'Profiler.stop',
    'workload',
  ])(
    'bounds an unresponsive %s and closes the inspector without leaked timers/listeners',
    async (stage) => {
      vi.useFakeTimers();
      const f = fixture();
      if (stage === 'opening') f.socket.readyState = WebSocket.CONNECTING;
      else f.socket.omit = stage;
      let workloadSignal: AbortSignal | undefined;
      const workload = vi.fn(async (signal: AbortSignal) => {
        workloadSignal = signal;
        if (stage === 'workload') await new Promise(() => {});
      });
      const assertion = expect(
        captureWorkerCpuProfile(origin, workload, { ...f, timeoutMs: 10 }),
      ).rejects.toThrow(/^Worker CPU profile failed$/);
      await vi.advanceTimersByTimeAsync(11);
      await assertion;
      expect(f.socket.close).toHaveBeenCalledOnce();
      expect(f.socket.listenerCount).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      if (stage === 'workload') {
        expect(workloadSignal?.aborted).toBe(true);
        expect(f.socket.commands.at(-1)).toBe('Profiler.stop');
      }
    },
  );

  it('bounds discovery even when its transport ignores the abort signal', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.request.mockImplementation(() => new Promise(() => {}));
    const assertion = expect(
      captureWorkerCpuProfile(origin, async () => {}, { ...f, timeoutMs: 10 }),
    ).rejects.toThrow(/^Worker CPU profile failed$/);
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    expect(f.connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves capture margin for a twenty-second workload under the default deadline', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const result = captureWorkerCpuProfile(
      origin,
      async () => new Promise<void>((resolve) => setTimeout(resolve, 20000)),
      f,
    ).then(
      (value) => ({ ok: true, value }),
      () => ({ ok: false }),
    );
    await vi.advanceTimersByTimeAsync(20000);
    expect(await result).toEqual({ ok: true, value: profile });
    expect(f.socket.commands.at(-1)).toBe('Profiler.stop');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still bounds the entire capture at thirty seconds by default', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const workload = vi.fn(async () => new Promise<void>(() => {}));
    const result = captureWorkerCpuProfile(origin, workload, f).then(
      () => 'unexpected-success',
      () => 'bounded-failure',
    );
    await vi.advanceTimersByTimeAsync(29999);
    expect(workload).toHaveBeenCalledOnce();
    expect(f.socket.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe('bounded-failure');
    expect(f.socket.close).toHaveBeenCalledOnce();
    expect(f.socket.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops sampling and closes after a private workload error', async () => {
    const f = fixture();
    await expect(
      captureWorkerCpuProfile(
        origin,
        async () => {
          throw new Error('PRIVATE_CONTENT');
        },
        f,
      ),
    ).rejects.toThrow(/^Worker CPU profile failed$/);
    expect(f.socket.commands.at(-1)).toBe('Profiler.stop');
    expect(f.socket.close).toHaveBeenCalledOnce();
    expect(f.socket.listenerCount).toBe(0);
  });

  it('closes after an inspector error without exposing its event', async () => {
    const f = fixture();
    f.socket.errorAt = 'Profiler.start';
    await expect(
      captureWorkerCpuProfile(origin, async () => {}, f),
    ).rejects.toThrow(/^Worker CPU profile failed$/);
    expect(f.socket.close).toHaveBeenCalledOnce();
    expect(f.socket.listenerCount).toBe(0);
  });

  it.each([
    'PRIVATE_CONTENT',
    '{"id":1,"error":{"message":"PRIVATE_CONTENT"}}',
    '{"id":1,"method":"Profiler.enable","params":{"PRIVATE_CONTENT":true}}',
    '{"id":1,"method":"Profiler.stop","params":{}}',
  ])('redacts malformed/protocol failures and closes', async (message) => {
    const f = fixture();
    f.socket.invalidMessage = message;
    await expect(
      captureWorkerCpuProfile(origin, async () => {}, f),
    ).rejects.toThrow(/^Worker CPU profile failed$/);
    expect(f.socket.close).toHaveBeenCalledOnce();
    expect(f.socket.listenerCount).toBe(0);
  });

  it('rejects malformed CPU output instead of retaining arbitrary inspector data', async () => {
    const f = fixture();
    f.socket.profile = { PRIVATE_CONTENT: true };
    await expect(
      captureWorkerCpuProfile(origin, async () => {}, f),
    ).rejects.toThrow(/^Worker CPU profile failed$/);
    expect(f.socket.close).toHaveBeenCalledOnce();
  });

  it('redacts a close failure after removing listeners and clearing the deadline', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.socket.close.mockImplementation(() => {
      throw new Error('PRIVATE_CONTENT');
    });
    await expect(
      captureWorkerCpuProfile(origin, async () => {}, f),
    ).rejects.toThrow(/^Worker CPU profile failed$/);
    expect(f.socket.close).toHaveBeenCalledOnce();
    expect(f.socket.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still closes when the best-effort failure cleanup cannot send stop', async () => {
    const f = fixture();
    const send = f.socket.send.getMockImplementation()!;
    f.socket.send.mockImplementation((data) => {
      if ((JSON.parse(data) as { method: string }).method === 'Profiler.stop')
        throw new Error('PRIVATE_CONTENT');
      send(data);
    });
    await expect(
      captureWorkerCpuProfile(
        origin,
        async () => {
          throw new Error('PRIVATE_CONTENT');
        },
        f,
      ),
    ).rejects.toThrow(/^Worker CPU profile failed$/);
    expect(f.socket.close).toHaveBeenCalledOnce();
    expect(f.socket.listenerCount).toBe(0);
  });

  it('reports only its trusted failed stage, ignoring raw or mutable error properties', async () => {
    const f = fixture();
    f.socket.profile = { PRIVATE_CONTENT: true };
    const error: unknown = await captureWorkerCpuProfile(
      origin,
      async () => {},
      f,
    ).catch((failure: unknown) => failure);
    expect(workerCpuProfileFailureStage(error)).toBe('profile-validation');
    Object.assign(error as Error, {
      stage: 'PRIVATE_CONTENT',
      message: 'PRIVATE_CONTENT',
    });
    expect(workerCpuProfileFailureStage(error)).toBe('profile-validation');
    for (const untrusted of [
      { stage: 'PRIVATE_CONTENT' },
      new Error('PRIVATE_CONTENT'),
      null,
    ])
      expect(workerCpuProfileFailureStage(untrusted)).toBeUndefined();
  });

  it('identifies a cleanup failure separately after a successful capture', async () => {
    const f = fixture();
    f.socket.close.mockImplementation(() => {
      throw new Error('PRIVATE_CONTENT');
    });
    const error: unknown = await captureWorkerCpuProfile(
      origin,
      async () => {},
      f,
    ).catch((failure: unknown) => failure);
    expect(workerCpuProfileFailureStage(error)).toBe('cleanup');
  });
});
