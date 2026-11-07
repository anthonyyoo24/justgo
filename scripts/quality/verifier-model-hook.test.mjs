import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { decide, output } from '../../.claude/hooks/verifier-model.mjs';

const hook = fileURLToPath(
  new URL('../../.claude/hooks/verifier-model.mjs', import.meta.url),
);
const recheck = { description: 'Re-verify PR fix round', prompt: 'Check it.' };
const first = { description: 'Independent verifier for PR', prompt: 'Review.' };

test('a docs- or tests-only, non-sensitive re-check runs on Sonnet', () => {
  const decision = decide(recheck, ['AGENTS.md', 'apps/mobile/src/x.test.tsx']);
  assert.equal(decision.model, 'sonnet');
  assert.deepEqual(output(recheck, decision).hookSpecificOutput.updatedInput, {
    ...recheck,
    model: 'sonnet',
  });
});

test('a first verifier stays on Opus even for docs only', () => {
  assert.equal(decide(first, ['AGENTS.md']).model, 'opus');
  assert.equal(
    output({ ...first, model: 'opus' }, decide(first, ['a.md'])),
    undefined,
  );
});

test('a re-check forces Opus over a requested Sonnet when code changed', () => {
  const input = { ...recheck, model: 'sonnet' };
  const result = output(
    input,
    decide(input, ['AGENTS.md', 'apps/api/src/a.ts']),
  );
  assert.equal(result.hookSpecificOutput.updatedInput.model, 'opus');
});

test('sensitive tests, a Sensitive flag or an unreadable diff keep Opus', () => {
  assert.equal(
    decide(recheck, ['apps/api/src/identity/a.test.ts']).model,
    'opus',
  );
  const flagged = { ...recheck, prompt: 'Sensitive: yes\nCheck it.' };
  assert.equal(decide(flagged, ['AGENTS.md']).model, 'opus');
  assert.equal(decide(recheck, undefined).model, 'opus');
  assert.equal(decide(recheck, []).model, 'opus');
});

test('other agents pass through untouched', () => {
  const input = { description: 'Inventory routes', prompt: 'List them.' };
  assert.equal(decide(input, ['AGENTS.md']), undefined);
});

test('the hook forces Opus for a verifier when its input breaks the diff', () => {
  const run = (event) =>
    spawnSync(process.execPath, [hook], {
      input: event,
      encoding: 'utf8',
      env: { ...process.env, JUSTGO_VERIFY_BASE: 'no-such-ref' },
    });
  const forced = run(
    JSON.stringify({
      tool_name: 'Agent',
      tool_input: { ...recheck, model: 'sonnet' },
    }),
  );
  assert.equal(forced.status, 0);
  assert.equal(
    JSON.parse(forced.stdout).hookSpecificOutput.updatedInput.model,
    'opus',
  );
  const garbage = run('not json');
  assert.equal(garbage.status, 0);
  assert.equal(garbage.stdout, '');
});
