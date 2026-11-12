import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  decide,
  filesOf,
  isVerifier,
  kindOf,
  maxFiles,
  maxSmallPulls,
  output,
  prOf,
  prsOf,
  strayReference,
  sizedFilesOf,
} from '../../.claude/hooks/verifier-model.mjs';
import * as sensitive from './sensitive-paths.mjs';
import * as patch from './verdict-patch.mjs';
import * as batch from './verify-batch.mjs';

const rules = { ...sensitive, ...patch, ...batch };
const sized = (...files) =>
  files.map(([path, additions, deletions = 0]) => ({
    path,
    additions,
    deletions,
  }));
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

test('a first verifier stays on Opus when the PR sizes are unknown', () => {
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

test('a verifier runs on Sonnet when every PR it names is small', () => {
  const small = sized(
    ['apps/mobile/src/features/progress/a.tsx', 120],
    ['apps/mobile/src/features/progress/a.test.tsx', 400],
    ['docs/implementation-plan/README.md', 300],
  );
  const decision = decide(first, ['x'], rules, [small]);
  assert.deepEqual(decision, {
    model: 'sonnet',
    reason: 'every PR is small and not sensitive',
  });
  const requested = { ...first, model: 'opus' };
  assert.equal(
    output(requested, decide(requested, ['x'], rules, [small, small]))
      .hookSpecificOutput.updatedInput.model,
    'sonnet',
  );
});

test('a sensitive, boundary, large or unknown PR keeps the verifier on Opus', () => {
  const small = sized(['apps/mobile/src/features/a.tsx', 10]);
  for (const other of [
    sized(['apps/mobile/src/app-support/identity/auth/a.test.ts', 1]),
    sized(['packages/contracts/src/a.ts', 1]),
    sized(['.claude/hooks/x.mjs', 1]),
    sized(['apps/mobile/src/features/a.tsx', 151]),
    sized(['AGENTS.md', 151]),
    [],
    undefined,
  ])
    assert.equal(
      decide(first, ['x'], rules, [small, other]).model,
      'opus',
      JSON.stringify(other),
    );
  const flagged = { ...first, prompt: `Sensitive: yes\n${first.prompt}` };
  assert.equal(decide(flagged, ['x'], rules, [small]).model, 'opus');
  assert.equal(decide(first, ['x'], rules, []).model, 'opus');
  assert.equal(decide(first, ['x'], rules, undefined).model, 'opus');
});

test('the brief names its PRs, also in lists, and only JustGO ones', () => {
  assert.deepEqual(prsOf({ description: 'Verify PRs #7, #8 and #9' }), [
    '7',
    '8',
    '9',
  ]);
  assert.deepEqual(
    prsOf({
      description: 'Verify PR #12',
      prompt: 'JustGO PR #12 (https://github.com/anthonyyoo24/justgo/pull/12)',
    }),
    ['12'],
  );
  assert.equal(prsOf({ prompt: 'the current branch' }), undefined);
  assert.equal(
    prsOf({ prompt: 'PR #7, ported from https://github.com/o/r/pull/7' }),
    undefined,
  );
  const many = Array.from({ length: maxSmallPulls + 1 }, (_, i) => `#${i + 1}`);
  assert.equal(
    prsOf({ description: `Verify PRs ${many.join(', ')}` }),
    undefined,
  );
});

test('a brief that mentions a PR or issue the lists miss names no PRs', () => {
  for (const text of [
    'Verify PRs #7 #8',
    'Verify PRs #7–#9',
    'Verify PR #7 / #8',
    'Verify PR #7 and otherorg/justgo#5',
    'Verify PR #7, which fixes #375',
    'Verify PR #7 (see https://github.com/anthonyyoo24/justgo/issues/375)',
    'Verify PR #7 after anthonyyoo24/justgo#8',
  ])
    assert.equal(prsOf({ description: text }), undefined, text);
  assert.equal(
    prsOf({ description: 'Verify PR #7', prompt: 'Also look at #8.' }),
    undefined,
  );
  // The numbers the lists name, the brief's own link and HTML entities pass.
  assert.deepEqual(
    prsOf({
      description: 'Verify PRs #7, #8',
      prompt:
        'PR #7 (https://github.com/anthonyyoo24/justgo/pull/7), PR #8, and anthonyyoo24/justgo#8 &#39;',
    }),
    ['7', '8'],
  );
  assert.equal(strayReference('#7 and #8', new Set(['7'])), '#8');
  assert.equal(strayReference('o/r#7', new Set(['7'])), 'o/r#7');
  assert.equal(strayReference('#7', new Set(['7'])), undefined);
});

test('up to 4 small PRs share a Sonnet verifier whatever their total', () => {
  const lines = (n) => sized(['apps/mobile/src/features/a.tsx', n]);
  const four = [lines(150), lines(150), lines(150), lines(150)];
  assert.equal(decide(first, ['x'], rules, four).model, 'sonnet');
  assert.equal(
    decide(first, ['x'], rules, [...four.slice(0, 3), lines(151)]).model,
    'opus',
  );
});

test('a renamed file keeps its old path, with no lines', () => {
  assert.deepEqual(
    sizedFilesOf([
      {
        filename: 'apps/mobile/src/features/a.tsx',
        previous_filename: 'apps/mobile/src/app-support/identity/a.tsx',
        additions: 2,
        deletions: 1,
      },
    ]),
    [
      { path: 'apps/mobile/src/features/a.tsx', additions: 2, deletions: 1 },
      {
        path: 'apps/mobile/src/app-support/identity/a.tsx',
        additions: 0,
        deletions: 0,
      },
    ],
  );
  assert.equal(sizedFilesOf([]), undefined);
  assert.equal(
    sizedFilesOf(Array.from({ length: maxFiles }, () => ({ filename: 'a' }))),
    undefined,
  );
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
    'Fix lint, then verify with pnpm run lint',
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
  // A link to this repository is the same PR as its number.
  assert.equal(
    prOf({
      prompt: 'PR #224 at https://github.com/AnthonyYoo24/JustGO/pull/224',
    }),
    '224',
  );
  // Another repository's PR is not JustGO's PR with the same number.
  assert.equal(
    prOf({ prompt: 'Like https://github.com/cursor/plugins/pull/224.' }),
    undefined,
  );
  assert.equal(
    prOf({ prompt: 'PR #224, ported from https://github.com/o/r/pull/224' }),
    undefined,
  );
});

test('verifiers are named by any form of verify or re-check, in any case', () => {
  for (const description of [
    'Verifying PR #7',
    'Verified fix check for PR #7',
    'Verifies the batch',
    'Verifiers for PR #7',
    'Re-checking PR #7',
    'Rechecked docs on PR #7',
  ])
    assert.equal(isVerifier({ description, prompt: '' }), true, description);
  assert.equal(
    isVerifier({
      description: 'Look',
      prompt: 'End with a VERIFIER VERDICT: line.',
    }),
    true,
  );
  const checking = { ...recheck, description: 'Re-checking PR 223' };
  assert.equal(decide(checking, ['AGENTS.md'], rules).model, 'sonnet');
});

test('a rename counts its old path, and a list that may be cut keeps Opus', () => {
  const moved = filesOf([
    {
      filename: 'docs/a.md',
      previous_filename: 'apps/api/src/identity/a.ts',
    },
    { filename: 'AGENTS.md' },
  ]);
  assert.deepEqual(moved, [
    'docs/a.md',
    'apps/api/src/identity/a.ts',
    'AGENTS.md',
  ]);
  assert.equal(decide(recheck, moved, rules).model, 'opus');
  const docs = Array.from({ length: maxFiles - 1 }, (_, i) => ({
    filename: `docs/${i}.md`,
  }));
  assert.equal(decide(recheck, filesOf(docs), rules).model, 'sonnet');
  docs.push({ filename: 'docs/last.md' });
  assert.equal(filesOf(docs), undefined);
  assert.equal(decide(recheck, filesOf(docs), rules).model, 'opus');
  assert.equal(filesOf([]), undefined);
});

test('the hook reads every page of the PR files, renames included', () => {
  const bin = mkdtempSync(path.join(tmpdir(), 'fake-gh-'));
  writeFileSync(
    path.join(bin, 'gh'),
    '#!/bin/sh\nprintf "%s\\n" "$*" > "$GH_ARGS"\ncat "$GH_PAGES"\n',
  );
  chmodSync(path.join(bin, 'gh'), 0o755);
  const run = (pages) => {
    writeFileSync(path.join(bin, 'pages.json'), JSON.stringify(pages));
    const result = spawnSync(process.execPath, [hook], {
      input: JSON.stringify({
        tool_name: 'Agent',
        tool_input: { ...recheck, model: 'sonnet' },
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:/bin:/usr/bin`,
        GH_ARGS: path.join(bin, 'args'),
        GH_PAGES: path.join(bin, 'pages.json'),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout
      ? JSON.parse(result.stdout).hookSpecificOutput.updatedInput.model
      : 'sonnet';
  };
  assert.equal(
    run([[{ filename: 'AGENTS.md' }], [{ filename: 'docs/b.md' }]]),
    'sonnet',
  );
  assert.equal(
    readFileSync(path.join(bin, 'args'), 'utf8').trim(),
    'api --paginate --slurp repos/anthonyyoo24/justgo/pulls/223/files?per_page=100',
  );
  assert.equal(
    run([
      [{ filename: 'AGENTS.md' }],
      [
        {
          filename: 'docs/b.md',
          previous_filename: 'apps/api/src/identity/b.ts',
        },
      ],
    ]),
    'opus',
  );
  // A small, non-sensitive PR runs on Sonnet whatever the rename hides.
  assert.equal(
    run([[{ filename: 'docs/b.md', previous_filename: 'apps/api/src/b.ts' }]]),
    'sonnet',
  );
});

test('the hook process runs a first verifier of a small PR on Sonnet', () => {
  const bin = mkdtempSync(path.join(tmpdir(), 'fake-gh-'));
  writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\ncat "$GH_PAGES"\n');
  chmodSync(path.join(bin, 'gh'), 0o755);
  const run = (pages) => {
    writeFileSync(path.join(bin, 'pages.json'), JSON.stringify(pages));
    const result = spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ tool_name: 'Agent', tool_input: first }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:/bin:/usr/bin`,
        GH_PAGES: path.join(bin, 'pages.json'),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout
      ? JSON.parse(result.stdout).hookSpecificOutput.updatedInput.model
      : undefined;
  };
  const file = { filename: 'apps/mobile/src/features/a.tsx', additions: 20 };
  assert.equal(run([[file]]), 'sonnet');
  assert.equal(run([[{ ...file, additions: 151 }]]), 'opus');
  assert.equal(
    run([[{ ...file, previous_filename: 'apps/api/src/identity/a.ts' }]]),
    'opus',
  );
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
    'Review final trail rows',
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
    'Harden require-trail-review hook',
    'Interrogate review: trail hook PR #167',
    'Owner: review trail hook fixes',
    'Review the require-trail-review hook PR',
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

test('a routine helper named by an allowed prefix keeps Sonnet', () => {
  for (const description of [
    'Research Expo SDK 55 router changes',
    'Inventory routes and verdict-recheck.yml',
    'Docs pass on the operations docs',
    'Docs-only rewrite of TESTFLIGHT_BETA.md',
    'Lint fix for the mobile workspace',
    'Format the changed files',
    'Formatting fix after rebase',
  ]) {
    const input = { description, prompt: 'Do it.', model: 'sonnet' };
    assert.equal(decide(input, undefined, rules), undefined, description);
    assert.equal(output(input, decide(input, undefined, rules)), undefined);
  }
});

test('pstack Sonnet roles named by role keep Sonnet', () => {
  for (const description of [
    'How explorer: activity runtime clock',
    'How explainer for the sync coordinator',
    'Why investigator: source control',
    'Why investigators, issue tracker',
    'Reflect tooling reviewer',
    'Reflect judgment reviewer',
    'Reflect divergent reviewer',
    'Reflect synthesizer',
    'Hillclimb attempt 3: journal write batching',
    'Arena cross-judge 2',
  ]) {
    const input = { description, prompt: 'Do it.', model: 'sonnet' };
    assert.equal(decide(input, undefined, rules), undefined, description);
  }
});

test('any other helper that picks a non-Opus model is rewritten to Opus', () => {
  for (const [description, model] of [
    ['Merge verified PRs', 'sonnet'],
    ['Install Bun and run pstack watcher', 'sonnet'],
    ['Owner: IDENTITY R46 backup ledger', 'sonnet'],
    ['Researcher notes', 'sonnet'],
    ['Formatter swap', 'sonnet'],
    ['Fix the reflect hook', 'claude-sonnet-5-5'],
    ['Inventory routes', 'haiku'],
    ['Quick look', 'haiku'],
  ]) {
    const input = { description, prompt: 'Do it.', model };
    const decision = decide(input, undefined, rules);
    assert.equal(decision?.model, 'opus', description);
    assert.match(decision.reason, /Research, Inventory, Docs pass/);
    assert.equal(
      output(input, decision).hookSpecificOutput.updatedInput.model,
      'opus',
    );
  }
});

test('a helper with no model or with Opus is left alone', () => {
  for (const input of [
    { description: 'Merge verified PRs', prompt: 'x' },
    { description: 'Merge verified PRs', prompt: 'x', model: 'opus' },
    { description: 'Owner: sync fix', prompt: 'x', model: 'claude-opus-5-5' },
  ])
    assert.equal(
      output(input, decide(input, undefined, rules)),
      undefined,
      JSON.stringify(input),
    );
});

test('the hook process rewrites a non-routine Sonnet helper to Opus', () => {
  const run = (tool_input) =>
    spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ tool_name: 'Agent', tool_input }),
      encoding: 'utf8',
      env: { ...process.env, PATH: '/nonexistent' },
    });
  const forced = run({
    description: 'Merge PRs',
    prompt: 'x',
    model: 'sonnet',
  });
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(
    JSON.parse(forced.stdout).hookSpecificOutput.updatedInput.model,
    'opus',
  );
  const kept = run({
    description: 'Inventory hooks',
    prompt: 'x',
    model: 'sonnet',
  });
  assert.equal(kept.status, 0, kept.stderr);
  assert.equal(kept.stdout, '');
});
