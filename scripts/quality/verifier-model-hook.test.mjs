import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  decide,
  isVerifier,
  kindOf,
  output,
  prOf,
} from '../../.claude/hooks/verifier-model.mjs';
import * as sensitive from './sensitive-paths.mjs';
import * as patch from './verdict-patch.mjs';

const rules = { ...sensitive, ...patch };
const hook = fileURLToPath(
  new URL('../../.claude/hooks/verifier-model.mjs', import.meta.url),
);
const recheck = {
  description: 'Re-verify PR 223 fix round',
  prompt: 'Re-verify PR #223. End with a Verifier verdict: line.',
};
const first = {
  description: 'Verify PR 223 independently',
  prompt: 'Verify PR #223.',
};

test('a docs- or tests-only, non-sensitive re-check runs on Sonnet', () => {
  const decision = decide(
    recheck,
    ['AGENTS.md', 'apps/mobile/src/x.test.tsx'],
    rules,
  );
  assert.equal(decision.model, 'sonnet');
  assert.deepEqual(output(recheck, decision).hookSpecificOutput, {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    permissionDecisionReason: `agent-model: sonnet (${decision.reason})`,
    updatedInput: { ...recheck, model: 'sonnet' },
  });
});

test('a first verifier stays on Opus even for docs only', () => {
  assert.equal(decide(first, ['AGENTS.md'], rules).model, 'opus');
  assert.equal(
    output({ ...first, model: 'opus' }, decide(first, ['a.md'], rules)),
    undefined,
  );
  const mentions = {
    description: 'Verify PR 223',
    prompt: 'A fresh agent will re-verify later.',
  };
  assert.equal(decide(mentions, ['a.md'], rules).model, 'opus');
});

test('a re-check forces Opus over a requested Sonnet when code changed', () => {
  const input = { ...recheck, model: 'sonnet' };
  const result = output(
    input,
    decide(input, ['AGENTS.md', 'apps/api/src/a.ts'], rules),
  );
  assert.equal(result.hookSpecificOutput.updatedInput.model, 'opus');
});

test('sensitive tests, a Sensitive flag or unknown files keep Opus', () => {
  assert.equal(
    decide(recheck, ['apps/api/src/identity/a.test.ts'], rules).model,
    'opus',
  );
  const flagged = { ...recheck, prompt: `Sensitive: yes\n${recheck.prompt}` };
  assert.equal(decide(flagged, ['AGENTS.md'], rules).model, 'opus');
  assert.equal(decide(recheck, undefined, rules).model, 'opus');
  assert.equal(decide(recheck, [], rules).model, 'opus');
});

test('only agents named as verifiers or asked for a verdict are touched', () => {
  for (const description of [
    'Inventory routes and verdict-recheck.yml',
    'Fix lint, then verify with npm run lint',
    'Recheck nothing',
  ])
    assert.equal(
      isVerifier({ description, prompt: 'List them.' }),
      description === 'Recheck nothing',
      description,
    );
  assert.equal(
    isVerifier({ description: 'Review', prompt: 'Verifier verdict: PASS' }),
    true,
  );
});

test('the diff comes from the one PR the brief names', () => {
  assert.equal(prOf(recheck), '223');
  assert.equal(
    prOf({ prompt: 'https://github.com/anthonyyoo24/justgo/pull/224' }),
    '224',
  );
  assert.equal(prOf({ prompt: 'PR #1 and PR #2' }), undefined);
  assert.equal(prOf({ prompt: 'the current branch' }), undefined);
});

test('settings block the Agent call when the hook fails', () => {
  const settings = JSON.parse(
    readFileSync(new URL('../../.claude/settings.json', import.meta.url)),
  );
  const [entry] = settings.hooks.PreToolUse;
  assert.equal(entry.matcher, 'Agent');
  assert.equal(entry.hooks[0].onFailure, 'block');
  assert.match(entry.hooks[0].command, /verifier-model\.mjs/);
});

test('the hook runs through a symlink and forces Opus when it cannot read the PR', () => {
  const link = path.join(mkdtempSync(path.join(tmpdir(), 'hook-')), 'h.mjs');
  symlinkSync(hook, link);
  const run = (event) =>
    spawnSync(process.execPath, [link], {
      input: event,
      encoding: 'utf8',
      env: { ...process.env, PATH: '/nonexistent' },
    });
  const forced = run(
    JSON.stringify({
      tool_name: 'Agent',
      tool_input: { ...recheck, model: 'sonnet' },
    }),
  );
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(
    JSON.parse(forced.stdout).hookSpecificOutput.updatedInput.model,
    'opus',
  );
  const other = run(
    JSON.stringify({ tool_name: 'Agent', tool_input: { description: 'x' } }),
  );
  assert.equal(other.stdout, '');
  assert.notEqual(run('not json').status, 0);
});

test('decision-trail reviews run on Sonnet, even when Opus is asked for', () => {
  for (const description of [
    'Review the decision trail',
    'Review the P15-3 decision trail',
    "Review the trail's final rows",
    'Review pstack-followups trail',
    'Trail review for the encode run',
    'Final review of the decision trail',
    'Close out the trail review',
  ]) {
    const input = { description, prompt: 'Read the trail.', model: 'opus' };
    assert.equal(kindOf(input), 'trail', description);
    const decision = decide(input, undefined, rules);
    assert.equal(decision.model, 'sonnet', description);
    assert.equal(
      output(input, decision).hookSpecificOutput.updatedInput.model,
      'sonnet',
    );
  }
});

test('an audit runs on Sonnet unless it is sensitive', () => {
  const audit = {
    description: 'P15-4 audit: diff vs plan and docs',
    prompt: 'Audit PR #203.',
  };
  assert.equal(kindOf(audit), 'audit');
  assert.equal(decide(audit, ['docs/a.md'], rules).model, 'sonnet');
  assert.equal(decide(audit, undefined, rules).model, 'sonnet');
  assert.equal(
    decide(audit, ['apps/api/src/identity/a.ts'], rules).model,
    'opus',
  );
  const flagged = { ...audit, prompt: `Sensitive: yes\n${audit.prompt}` };
  assert.equal(decide(flagged, ['docs/a.md'], rules).model, 'opus');
});

test('fix rounds and builders that mention a trail or an audit are left alone', () => {
  for (const description of [
    'Fix audit findings on PR 203',
    'Build the trail review hook',
    'Final verdict and trail review',
    'Inventory IDENTITY.md rules',
    'Owner: IDENTITY R46 backup ledger',
  ]) {
    const input = { description, prompt: 'Do it.' };
    assert.equal(kindOf(input), undefined, description);
    assert.equal(decide(input, undefined, rules), undefined, description);
  }
  assert.equal(
    kindOf({ description: 'Verify decision record and review trail' }),
    'verifier',
  );
});

test('the hook routes a trail review without reading GitHub', () => {
  const run = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({
      tool_name: 'Agent',
      tool_input: { description: 'Review the decision trail', prompt: 'x' },
    }),
    encoding: 'utf8',
    env: { ...process.env, PATH: '/nonexistent' },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    JSON.parse(run.stdout).hookSpecificOutput.updatedInput.model,
    'sonnet',
  );
});
