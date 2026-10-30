import { z } from 'zod';

const repository = 'anthonyyoo24/justgo';
const workflowPath = '.github/workflows/database-backups.yml';
const workflowEndpoint = `https://api.github.com/repos/${repository}/actions/workflows/database-backups.yml`;
const databaseRunName = 'Encrypted database recovery copy';
const copyStepName = 'Encrypt and verify recovery copy';
const failure = 'Recent successful database backup could not be verified';
const githubTimestamp = z.iso.datetime({ offset: true });

/**
 * Return the earliest daily database slot that can satisfy this health check.
 * Yesterday's 04:43 UTC slot remains eligible during the 40-minute grace period;
 * at exactly 05:23 UTC, today's slot becomes mandatory, including across UTC dates.
 *
 * @param {number} now Current Unix time in milliseconds.
 * @returns {number} Required 04:43 UTC slot as Unix milliseconds.
 */
export function requiredDatabaseSlot(now) {
  if (!Number.isFinite(now)) throw new Error(failure);
  const slot = new Date(now);
  slot.setUTCHours(4, 43, 0, 0);
  if (now < slot.getTime() + 40 * 60000) slot.setUTCDate(slot.getUTCDate() - 1);
  return slot.getTime();
}

/** Reject non-ISO API timestamps with NaN so freshness comparisons fail closed. */
function timestamp(value) {
  return githubTimestamp.safeParse(value).success ? Date.parse(value) : NaN;
}
/** Reject coerced, fractional or unsafe GitHub IDs, attempts and step numbers. */
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

/**
 * Accept only a completed, successful database-copy run from this repository's
 * main workflow, with an allowed trigger and timestamps inside the required window.
 * Repository, workflow and title checks prevent a fork or ledger run from serving
 * as database-copy evidence; job/step execution is checked separately.
 */
function trustedRun(run, workflowId, since, now) {
  const created = timestamp(run?.created_at);
  const started = timestamp(run?.run_started_at);
  const completed = timestamp(run?.updated_at);
  return (
    positiveInteger(run?.id) &&
    positiveInteger(run.run_attempt) &&
    run.workflow_id === workflowId &&
    [
      workflowPath,
      `${workflowPath}@main`,
      `${workflowPath}@refs/heads/main`,
    ].includes(run.path) &&
    run.display_title === databaseRunName &&
    run.repository?.full_name === repository &&
    run.head_repository?.full_name === repository &&
    run.head_branch === 'main' &&
    /^[a-f0-9]{40}$/.test(run.head_sha ?? '') &&
    ['schedule', 'workflow_dispatch'].includes(run.event) &&
    run.status === 'completed' &&
    run.conclusion === 'success' &&
    since <= created &&
    created <= started &&
    started <= completed &&
    completed <= now
  );
}

/**
 * Validate the jobs response fetched for the selected run attempt. Require one
 * successful backup job and one successful copy step, with matching run/SHA and
 * ordered timestamps, so a skipped opt-in job cannot satisfy database health.
 */
function copiedDatabase(payload, run, now) {
  if (
    payload?.total_count !== 1 ||
    !Array.isArray(payload.jobs) ||
    payload.jobs.length !== 1
  )
    return false;
  const job = payload.jobs[0];
  const started = timestamp(job?.started_at);
  const completed = timestamp(job?.completed_at);
  if (
    !positiveInteger(job?.id) ||
    job.run_id !== run.id ||
    job.head_sha !== run.head_sha ||
    job.name !== 'backup' ||
    job.status !== 'completed' ||
    job.conclusion !== 'success' ||
    !(timestamp(run.run_started_at) <= started) ||
    !(started <= completed && completed <= timestamp(run.updated_at)) ||
    !(completed <= now) ||
    !Array.isArray(job.steps)
  )
    return false;
  const copies = job.steps.filter((step) => step?.name === copyStepName);
  const step = copies[0];
  return (
    copies.length === 1 &&
    positiveInteger(step.number) &&
    step.status === 'completed' &&
    step.conclusion === 'success' &&
    started <= timestamp(step.started_at) &&
    timestamp(step.started_at) <= timestamp(step.completed_at) &&
    timestamp(step.completed_at) <= completed
  );
}

/**
 * Verify that the hourly ledger heartbeat has recent database-copy evidence.
 * Read only fixed GitHub workflow/run/job metadata with the ephemeral Actions token;
 * bound pagination to 300 runs and reject unavailable, malformed or stale evidence.
 * Logs, artifacts and response bodies never become diagnostics.
 *
 * @param env Identity of the main-branch job and its read-only Actions token.
 * @param options Injectable clock and HTTP transport for freshness/failure tests.
 * @returns Resolves only after a trusted run and its actual copy step are verified.
 */
export async function verifyRecentDatabaseCopy(
  env,
  { now = Date.now(), send = fetch } = {},
) {
  try {
    const since = requiredDatabaseSlot(now);
    if (
      !Number.isFinite(since) ||
      env.GITHUB_REPOSITORY !== repository ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_WORKFLOW_REF !==
        `${repository}/${workflowPath}@refs/heads/main` ||
      !env.BACKUP_ACTIONS_TOKEN
    )
      throw new Error(failure);
    const read = async (url) => {
      const response = await send(url, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${env.BACKUP_ACTIONS_TOKEN}`,
          'X-GitHub-Api-Version': '2026-03-10',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(failure);
      }
      return response.json();
    };
    const workflow = await read(workflowEndpoint);
    if (
      !positiveInteger(workflow?.id) ||
      workflow.path !== workflowPath ||
      workflow.state !== 'active' ||
      workflow.url !==
        `https://api.github.com/repos/${repository}/actions/workflows/${workflow.id}`
    )
      throw new Error(failure);
    // Normally fewer than 30 runs match this window. Bound exceptional manual
    // activity to three pages; unavailable evidence must never report healthy.
    for (let page = 1; page <= 3; page++) {
      const url = new URL(`${workflowEndpoint}/runs`);
      url.search = new URLSearchParams({
        branch: 'main',
        status: 'completed',
        created: `>=${new Date(since).toISOString()}`,
        exclude_pull_requests: 'true',
        per_page: '100',
        page: String(page),
      }).toString();
      const payload = await read(url.href);
      if (
        !Number.isSafeInteger(payload?.total_count) ||
        payload.total_count < 0 ||
        !Array.isArray(payload.workflow_runs) ||
        payload.workflow_runs.length > 100 ||
        payload.total_count < payload.workflow_runs.length
      )
        throw new Error(failure);
      const run = payload.workflow_runs.find((candidate) =>
        trustedRun(candidate, workflow.id, since, now),
      );
      if (run) {
        // Workflow success alone also describes a skipped opt-in job. Require
        // the actual copy step on this exact attempt to have succeeded.
        const jobs = await read(
          `https://api.github.com/repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
        );
        if (!copiedDatabase(jobs, run, now)) throw new Error(failure);
        return;
      }
      if (
        payload.total_count <= page * 100 ||
        payload.workflow_runs.length < 100
      )
        break;
    }
  } catch {
    throw new Error(failure);
  }
  throw new Error(failure);
}
