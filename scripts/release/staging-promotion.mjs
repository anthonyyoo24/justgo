import { request as httpsRequest } from 'node:https';
import {
  isVersionId,
  requireRelease,
  StagingRunnerFailure,
} from './staging-api.mjs';

/** Send one promotion POST. Deployment readback, rather than its body, proves completion. */
export async function promoteStagingCandidate(
  deploymentId,
  { target, token, signal, request = httpsRequest, timeoutMs = 20_000 } = {},
) {
  const failure = () =>
    new StagingRunnerFailure('STAGING_PROMOTION_UNCONFIRMED');
  requireRelease(
    isVersionId(deploymentId) &&
      /^[a-f0-9]{32}$/.test(target?.accountId ?? '') &&
      target?.worker === 'justgo-api-staging' &&
      !/[\r\n]/.test(deploymentId) &&
      typeof token === 'string' &&
      token.length > 0 &&
      !/[\r\n]/.test(token) &&
      !signal?.aborted &&
      Number.isFinite(timeoutMs) &&
      timeoutMs > 0 &&
      timeoutMs <= 20_000,
    'STAGING_PROMOTION_UNCONFIRMED',
  );
  const url = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${target.accountId}/workers/scripts/${target.worker}/deployments`,
  );
  const body = JSON.stringify({
    strategy: 'percentage',
    versions: [{ version_id: deploymentId, percentage: 100 }],
  });
  let outgoing;
  let timer;
  try {
    await new Promise((resolve, reject) => {
      outgoing = request(
        url,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(body)),
          },
          agent: false,
          rejectUnauthorized: true,
          signal,
        },
        (response) => {
          response.on('error', () => reject(failure()));
          response.on('aborted', () => reject(failure()));
          // Readback owns completion evidence. Discard all provider content
          // without buffering, logging, redirecting or retrying.
          const status = response.statusCode;
          response.on('end', () => {
            if (response.complete && (status === 200 || status === 201))
              resolve();
            else reject(failure());
          });
          response.on('close', () => {
            if (!response.complete) reject(failure());
          });
          response.resume();
        },
      );
      outgoing.on('error', () => reject(failure()));
      timer = setTimeout(() => {
        // A closed/upgraded request may emit no further error on destroy.
        // Settle the deadline independently of the transport's event sequence.
        const error = failure();
        reject(error);
        outgoing.destroy(error);
      }, timeoutMs);
      outgoing.end(body);
    });
  } catch {
    throw failure();
  } finally {
    clearTimeout(timer);
    outgoing?.destroy();
  }
}
