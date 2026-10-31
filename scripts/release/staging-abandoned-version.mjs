import {
  requireRelease,
  validateBindingPreservation,
  validateDeployment,
  validateVersion,
} from './staging-api.mjs';

// One reviewed incident, not a registry or a mechanism to adopt future failures.
const incident = Object.freeze({
  accountId: '52662d8ba7ae983237860a1719c66a1e',
  worker: 'justgo-api-staging',
  deploymentId: 'caaa7a54-d4a3-4eec-bdc2-9d5f927142e5',
  baselineId: 'd15d9fbd-1d99-4106-abc4-43b907ba7a2c',
  baselineSha: '7d8a5624bf7224bc243a342dab22a9d0b82f7f04',
  abandonedId: 'c5af7c5b-d045-470b-b91e-d6cfbe7accf5',
  sha: '742f3e03ceb823c93e8ddfa9d6e131dfcfc83987',
  runId: '41159286606',
  attempt: '1',
  predecessor: Object.freeze({
    abandonedId: 'c0fefad7-9a31-4db7-976a-bfc8fbb0366b',
    sha: '39f11c3b6475e4f9666ebf8b2698daf05740920d',
    runId: '41095205288',
    attempt: '1',
  }),
  earlierPredecessor: Object.freeze({
    abandonedId: '2d6ea61b-2714-4cd9-9437-2a73f9476dd6',
    sha: '8b1e7d5838fa0d3d8d828aedbf15a3ecfbc85ba4',
    runId: '41075504576',
    attempt: '1',
  }),
});
const rejected = 'STAGING_ABANDONED_VERSION_REJECTED';

/** Reject unknown opt-ins before provider I/O; an omitted input changes nothing. */
export function abandonedVersionRequested(env, target) {
  const value = env.STAGING_ABANDONED_VERSION_ID;
  if (value === undefined || value === '') return false;
  requireRelease(
    value === incident.abandonedId &&
      env.RELEASE_OPERATION === 'deploy' &&
      target.accountId === incident.accountId &&
      target.worker === incident.worker,
    rejected,
  );
  return true;
}

/**
 * Re-read all three exact unpromoted uploads and the sole deployed baseline.
 * Called at preflight and immediately before replacement upload, never after it.
 * Any new version/deployment, missing provenance or binding drift fails closed.
 */
export async function verifyAbandonedVersion({
  api,
  target,
  baseline,
  previous,
}) {
  requireRelease(
    target.accountId === incident.accountId &&
      target.worker === incident.worker &&
      baseline.id === incident.deploymentId &&
      baseline.versionId === incident.baselineId &&
      previous.id === incident.baselineId &&
      previous.sourceSha === incident.baselineSha,
    rejected,
  );
  const deployments = await api('/deployments');
  const deployed = validateDeployment(deployments);
  requireRelease(
    Array.isArray(deployments.deployments) &&
      deployments.deployments.length === 1 &&
      deployed.id === incident.deploymentId &&
      deployed.versionId === incident.baselineId,
    rejected,
  );
  const versions = await api('/versions');
  requireRelease(
    Array.isArray(versions?.items) &&
      versions.items.length === 4 &&
      versions.items[0]?.id === incident.abandonedId &&
      versions.items[1]?.id === incident.predecessor.abandonedId &&
      versions.items[2]?.id === incident.earlierPredecessor.abandonedId &&
      versions.items[3]?.id === incident.baselineId,
    rejected,
  );
  for (const expected of [
    incident,
    incident.predecessor,
    incident.earlierPredecessor,
  ]) {
    const value = await api(`/versions/${expected.abandonedId}`);
    const abandoned = validateVersion(value, target, expected);
    requireRelease(
      abandoned.id === expected.abandonedId &&
        value.annotations?.['workers/tag'] === expected.sha &&
        value.annotations?.['workers/message'] ===
          `JustGO ${expected.sha} GitHub ${expected.runId}/${expected.attempt}`,
      rejected,
    );
    validateBindingPreservation(previous, abandoned);
  }
}
