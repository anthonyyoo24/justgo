import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  trailDirectory,
  trailsNeedingReview,
} from '../../.claude/hooks/require-trail-review.mjs';

const hook = fileURLToPath(
  new URL('../../.claude/hooks/require-trail-review.mjs', import.meta.url),
);
const header = 'ts\tphase\tdecision\twhy\tevidence\tresult\n';

function workspace(rows) {
  const root = mkdtempSync(path.join(tmpdir(), 'trail-hook-'));
  mkdirSync(path.join(root, trailDirectory), { recursive: true });
  const transcript = path.join(root, 'transcript.jsonl');
  writeFileSync(
    transcript,
    `{"text":"appended to ${trailDirectory}/run.tsv"}\n`,
  );
  const trail = path.join(root, trailDirectory, 'run.tsv');
  writeFileSync(trail, header + rows.join('\n'));
  const later = new Date(Date.now() + 1000);
  utimesSync(trail, later, later);
  return { root, trail, transcript };
}

function runHook(root, transcript, extra = {}) {
  const result = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ transcript_path: transcript, cwd: root, ...extra }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : undefined;
}

const row = (phase) =>
  `2026-11-05T00:00:00Z\t${phase}\tdid it\tbecause\tPR 1\tok`;

test('blocks the stop when this session wrote a trail with no review', () => {
  const { root, transcript } = workspace([row('build')]);
  const output = runHook(root, transcript);
  assert.equal(output?.decision, 'block');
  assert.match(output.reason, /run\.review\.md/);
});

test('allows the stop once a review is newer than the trail', () => {
  const { root, trail, transcript } = workspace([row('report')]);
  const review = trail.replace(/\.tsv$/, '.review.md');
  writeFileSync(review, 'Attention: none');
  const later = new Date(Date.now() + 1000);
  utimesSync(review, later, later);
  assert.equal(runHook(root, transcript), undefined);
});

test('blocks again when rows land after the review', () => {
  const { root, trail, transcript } = workspace([row('report')]);
  const review = trail.replace(/\.tsv$/, '.review.md');
  writeFileSync(review, 'Attention: none');
  const earlier = new Date(Date.now() - 60_000);
  utimesSync(review, earlier, earlier);
  assert.equal(runHook(root, transcript)?.decision, 'block');
});

test('a run paused with a waiting row may stop', () => {
  const { root, transcript } = workspace([row('build'), row('waiting')]);
  assert.equal(runHook(root, transcript), undefined);
});

test('a turn that ends while background work runs may stop', () => {
  const { root, transcript } = workspace([row('build')]);
  const background_tasks = [{ id: 'task-1', type: 'subagent' }];
  assert.equal(runHook(root, transcript, { background_tasks }), undefined);
});

test("another session's trail does not bind this session", () => {
  const { root, transcript } = workspace([row('build')]);
  writeFileSync(transcript, '{"text":"unrelated session"}\n');
  assert.equal(runHook(root, transcript), undefined);
});

test('a trail last written before this session started does not bind it', () => {
  const { root, trail } = workspace([row('build')]);
  const earlier = new Date(Date.now() - 3_600_000);
  utimesSync(trail, earlier, earlier);
  assert.deepEqual(
    trailsNeedingReview({
      root,
      transcript: 'pstack run.tsv',
      sessionStartMs: Date.now() - 60_000,
    }),
    [],
  );
});

test('a second stop in a row is allowed so the hook cannot trap a session', () => {
  const { root, transcript } = workspace([row('build')]);
  assert.equal(
    runHook(root, transcript, { stop_hook_active: true }),
    undefined,
  );
});

test('the hook runs when reached through a symlinked path', () => {
  const { root, transcript } = workspace([row('build')]);
  const link = path.join(
    mkdtempSync(path.join(tmpdir(), 'hook-link-')),
    'hook.mjs',
  );
  symlinkSync(hook, link);
  const result = spawnSync(process.execPath, [link], {
    input: JSON.stringify({ transcript_path: transcript, cwd: root }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  assert.equal(JSON.parse(result.stdout).decision, 'block');
});

test('a turn that ends with a scheduled check pending may stop', () => {
  const { root, transcript } = workspace([row('build')]);
  const session_crons = [{ id: 'cron-1' }];
  assert.equal(runHook(root, transcript, { session_crons }), undefined);
});

test('the hook ignores a trail written before the session transcript began', () => {
  const { root, trail, transcript } = workspace([row('build')]);
  const earlier = new Date(Date.now() - 3_600_000);
  utimesSync(trail, earlier, earlier);
  assert.equal(runHook(root, transcript), undefined);
});
