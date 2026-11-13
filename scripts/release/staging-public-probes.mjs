import { setTimeout as pause } from 'node:timers/promises';
import {
  requireRelease,
  StagingRunnerFailure,
  stagingRunnerFailureCode,
  validateProbe,
} from './staging-api.mjs';

const budgetMs = 30_000;
const propagationWaitMs = 2000;
const endpoints = [
  ['/health', 'health'],
  ['/ready', 'ready'],
  ['/v1/journal-sync?limit=1', 'unauthorized'],
  ['/v1/completion-restores?limit=1', 'unauthorized'],
];

/** Probes carry no user credentials and never follow a redirect to an old host. */
export async function stagingProbe(
  origin,
  path,
  { signal, fetch: send = globalThis.fetch } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await send(new URL(path, origin), {
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal,
    });
    const reader = response.body?.getReader();
    requireRelease(reader, 'INVALID_STAGING_PROBE');
    let length = 0;
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      requireRelease(length <= 4096, 'INVALID_STAGING_PROBE');
      chunks.push(value);
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.concat(chunks).toString('utf8'),
    };
  } catch {
    throw new StagingRunnerFailure('INVALID_STAGING_PROBE');
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

/** Accept a previous response only when its complete endpoint contract is valid. */
function previousResponse(response, kind, candidateSha, previousSha) {
  try {
    validateProbe(response, kind, candidateSha);
    return undefined;
  } catch (error) {
    if (
      kind === 'unauthorized' ||
      stagingRunnerFailureCode(error) !== 'STAGING_RUNTIME_IDENTITY_MISMATCH'
    )
      throw error;
    try {
      validateProbe(response, kind, previousSha);
    } catch {
      // Preserve the strict candidate validator's original classification.
      throw error;
    }
    return error;
  }
}

/**
 * Confirm one complete public candidate round after promotion. Only a fully
 * valid captured baseline permits another round while deployment propagates.
 * The single deadline includes network time and waits; losing the lease or any
 * other probe failure stops immediately. This never uploads or promotes.
 */
export async function verifyPublicStagingProbes({
  origin,
  candidateSha,
  previousSha,
  signal,
  probe = stagingProbe,
  wait = pause,
  now = () => performance.now(),
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  const deadline = new AbortController();
  const combined = signal
    ? AbortSignal.any([signal, deadline.signal])
    : deadline.signal;
  const expiresAt = now() + budgetMs;
  let expired = false;
  let previousFailure;
  const alive = () => {
    if (signal?.aborted)
      throw new StagingRunnerFailure('STAGING_DATABASE_LEASE_LOST');
    if (expired || now() >= expiresAt)
      throw (
        previousFailure ?? new StagingRunnerFailure('INVALID_STAGING_PROBE')
      );
  };
  const timer = schedule(() => {
    expired = true;
    deadline.abort();
  }, budgetMs);

  async function bounded(operation) {
    alive();
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => {
        try {
          alive();
        } catch (error) {
          reject(error);
        }
      };
      combined.addEventListener('abort', onAbort, { once: true });
      if (combined.aborted) onAbort();
    });
    try {
      // Observe late transport settlement without allowing it to report success.
      const value = await Promise.race([
        Promise.resolve().then(() => {
          alive();
          return operation();
        }),
        aborted,
      ]);
      alive();
      return value;
    } catch (error) {
      alive();
      if (stagingRunnerFailureCode(error)) throw error;
      throw new StagingRunnerFailure('INVALID_STAGING_PROBE');
    } finally {
      combined.removeEventListener('abort', onAbort);
    }
  }

  try {
    for (;;) {
      let sawPrevious = false;
      for (const [path, kind] of endpoints) {
        const response = await bounded(() =>
          probe(origin, path, { signal: combined }),
        );
        const failure = previousResponse(
          response,
          kind,
          candidateSha,
          previousSha,
        );
        if (failure) {
          previousFailure = failure;
          sawPrevious = true;
        }
      }
      alive();
      if (!sawPrevious) return;
      await bounded(() =>
        wait(Math.min(propagationWaitMs, expiresAt - now()), undefined, {
          signal: combined,
        }),
      );
    }
  } finally {
    cancel(timer);
    deadline.abort();
  }
}
