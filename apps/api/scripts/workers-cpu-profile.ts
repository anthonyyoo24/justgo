import { z } from 'zod';

type InspectorSocket = Pick<
  WebSocket,
  'readyState' | 'addEventListener' | 'removeEventListener' | 'send' | 'close'
>;
// Node 24 supports Undici's header options; the shared DOM declaration exposes
// only the browser constructor signature.
const NodeWebSocket = WebSocket as typeof WebSocket & {
  new (url: string, options: { headers: { Origin: string } }): WebSocket;
};

const profileSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      callFrame: z.object({
        functionName: z.string(),
        scriptId: z.string(),
        url: z.string(),
        lineNumber: z.number().int(),
        columnNumber: z.number().int(),
      }),
      hitCount: z.number().int().nonnegative().optional(),
      children: z.array(z.number().int().nonnegative()).optional(),
      deoptReason: z.string().optional(),
      positionTicks: z
        .array(z.object({ line: z.number().int(), ticks: z.number().int() }))
        .optional(),
    }),
  ),
  startTime: z.number().nonnegative(),
  endTime: z.number().nonnegative(),
  samples: z.array(z.number().int().nonnegative()).optional(),
  timeDeltas: z.array(z.number().int()).optional(),
});

type ProfileStage =
  | 'discovery'
  | 'connection'
  | 'enable'
  | 'start'
  | 'workload'
  | 'stop'
  | 'profile-validation'
  | 'cleanup';
const failureStages = new WeakMap<object, ProfileStage>();
const failed = (stage?: ProfileStage) => {
  const error = new Error('Worker CPU profile failed');
  if (stage) failureStages.set(error, stage);
  return error;
};

/** Fixed local stages only; lookalike or mutable provider error fields are ignored. */
export function workerCpuProfileFailureStage(error: unknown) {
  return typeof error === 'object' && error !== null
    ? failureStages.get(error)
    : undefined;
}

function inspectorUrl(value: string, websocket = false) {
  const url = new URL(value);
  const port = Number(url.port);
  if (
    url.protocol !== (websocket ? 'ws:' : 'http:') ||
    url.hostname !== '127.0.0.1' ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== (websocket ? '/ws' : '/')
  )
    throw failed();
  return url;
}

/** A deadline also bounds injected transports/workloads that ignore cancellation. */
function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(failed());
    if (signal.aborted) {
      // Still observe work's rejection after cancellation.
      void work.catch(() => {});
      reject(failed());
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    void work.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      () => {
        signal.removeEventListener('abort', abort);
        reject(failed());
      },
    );
  });
}

/** Capture only the owned local Wrangler inspector; never connect to a discovered remote URL. */
export async function captureWorkerCpuProfile(
  origin: string,
  workload: (signal: AbortSignal) => Promise<void>,
  io: {
    request?: typeof fetch;
    connect?: (
      url: string,
      options: { headers: { Origin: string } },
    ) => InspectorSocket;
    timeoutMs?: number;
  } = {},
) {
  const controller = new AbortController();
  const signal = controller.signal;
  const timeoutMs = io.timeoutMs ?? 30000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw failed();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let socket: InspectorSocket | undefined;
  let started = false;
  let stopRequested = false;
  let captured: z.infer<typeof profileSchema> | undefined;
  let captureFailed = false;
  let stage: ProfileStage = 'discovery';
  let nextId = 0;
  const disconnect = () => controller.abort();
  try {
    const target = inspectorUrl(origin);
    const response = await bounded(
      (io.request ?? fetch)(new URL('/json/list', target), {
        redirect: 'error',
        signal,
      }),
      signal,
    );
    if (!response.ok || response.redirected) throw failed();
    const targets = z
      .array(z.object({ webSocketDebuggerUrl: z.string() }))
      .length(1)
      .parse(await bounded(response.json(), signal));
    const debuggerUrl = inspectorUrl(targets[0]!.webSocketDebuggerUrl, true);
    if (debuggerUrl.host !== target.host) throw failed();
    stage = 'connection';
    // Wrangler rejects clients with a User-Agent but no Origin. Node's native
    // client needs an explicit header; never derive it from discovery data.
    socket = (
      io.connect ?? ((url, options) => new NodeWebSocket(url, options))
    )(debuggerUrl.href, { headers: { Origin: target.origin } });
    const connection = socket;
    connection.addEventListener('close', disconnect);
    connection.addEventListener('error', disconnect);
    if (
      connection.readyState !== WebSocket.CONNECTING &&
      connection.readyState !== WebSocket.OPEN
    )
      throw failed();
    if (connection.readyState !== WebSocket.OPEN) {
      let opened: (() => void) | undefined;
      try {
        await bounded(
          new Promise<void>((resolve) => {
            opened = resolve;
            connection.addEventListener('open', opened, { once: true });
          }),
          signal,
        );
      } finally {
        if (opened) connection.removeEventListener('open', opened);
      }
    }
    const command = async (method: string) => {
      if (connection.readyState !== WebSocket.OPEN) throw failed();
      const id = ++nextId;
      let receive: ((event: MessageEvent) => void) | undefined;
      try {
        return await bounded(
          new Promise<Record<string, unknown>>((resolve, reject) => {
            receive = (event) => {
              try {
                if (typeof event.data !== 'string') throw failed();
                const message = z
                  .object({
                    id: z.number().optional(),
                    method: z.string().optional(),
                    params: z.unknown().optional(),
                    error: z.unknown().optional(),
                    result: z.record(z.string(), z.unknown()).optional(),
                  })
                  .parse(JSON.parse(event.data) as unknown);
                if (message.id !== id) return;
                if (message.error != null) throw failed();
                if (message.result) {
                  resolve(message.result);
                  return;
                }
                // Pinned workerd echoes these empty commands without initResult().
                // Require its exact acknowledgment; stop still needs a profile.
                if (
                  ['Profiler.enable', 'Profiler.start'].includes(method) &&
                  message.method === method &&
                  z.object({}).strict().safeParse(message.params).success
                ) {
                  resolve({});
                  return;
                }
                throw failed();
              } catch {
                reject(failed());
              }
            };
            connection.addEventListener('message', receive);
            connection.send(JSON.stringify({ id, method }));
          }),
          signal,
        );
      } finally {
        if (receive) connection.removeEventListener('message', receive);
      }
    };
    stage = 'enable';
    await command('Profiler.enable');
    stage = 'start';
    started = true;
    await command('Profiler.start');
    stage = 'workload';
    await bounded(
      Promise.resolve().then(() => workload(signal)),
      signal,
    );
    stage = 'stop';
    stopRequested = true;
    const result = await command('Profiler.stop');
    stage = 'profile-validation';
    const profile = profileSchema.parse(result.profile);
    if (profile.endTime < profile.startTime) throw failed();
    captured = profile;
  } catch {
    captureFailed = true;
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (socket) {
      socket.removeEventListener('close', disconnect);
      socket.removeEventListener('error', disconnect);
      try {
        // If the workload failed, stop sampling before closing. Never retry or
        // await an unresponsive inspector after the capture's deadline.
        if (started && !stopRequested && socket.readyState === WebSocket.OPEN)
          socket.send(
            JSON.stringify({ id: ++nextId, method: 'Profiler.stop' }),
          );
      } catch {
        if (!captureFailed) stage = 'cleanup';
        captureFailed = true;
      }
      try {
        socket.close();
      } catch {
        if (!captureFailed) stage = 'cleanup';
        captureFailed = true;
      }
    }
  }
  if (captureFailed || !captured) throw failed(stage);
  return captured;
}
