import { request as httpsRequest } from 'node:https';
import {
  stagingTarget as target,
  requireRelease,
  StagingRunnerFailure,
} from './staging-api.mjs';

/** Send one promotion POST. Alias readback, rather than its body, proves completion. */
export async function promoteStagingCandidate(
  deploymentId,
  { token, signal, request = httpsRequest, timeoutMs = 20_000 } = {},
) {
  const failure = () =>
    new StagingRunnerFailure('STAGING_PROMOTION_UNCONFIRMED');
  requireRelease(
    typeof deploymentId === 'string' &&
      /^dpl_[A-Za-z0-9]+$/.test(deploymentId) &&
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
    `https://api.vercel.com/v10/projects/${target.project}/promote/${deploymentId}?teamId=${target.team}`,
  );
  let outgoing;
  let timer;
  try {
    await new Promise((resolve, reject) => {
      outgoing = request(
        url,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-length': '0' },
          agent: false,
          rejectUnauthorized: true,
          signal,
        },
        (response) => {
          response.on('error', () => reject(failure()));
          response.on('aborted', () => reject(failure()));
          // The documented success response may have no body. Discard all
          // provider content without buffering, logging, redirecting or retrying.
          const status = response.statusCode;
          response.on('end', () => {
            if (response.complete && (status === 201 || status === 202))
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
      outgoing.end();
    });
  } catch {
    throw failure();
  } finally {
    clearTimeout(timer);
    outgoing?.destroy();
  }
}
