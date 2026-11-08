import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  decide,
  output,
  sessionTool,
} from '../../.claude/hooks/session-model-guard.mjs';

const hook = fileURLToPath(
  new URL('../../.claude/hooks/session-model-guard.mjs', import.meta.url),
);
const card = {
  initiation: 'own_initiative',
  title: 'Merge verified PRs',
  prompt: 'Merge the verified PRs.',
};

test('a session start that sets model is denied', () => {
  for (const model of ['claude-sonnet-5-5', 'sonnet', 'claude-opus-5-5', '']) {
    const decision = decide(sessionTool, { ...card, model });
    assert.equal(decision?.permissionDecision, 'deny', model);
    assert.match(decision.reason, /leave `model` unset/);
    assert.match(decision.reason, /Anthony/);
  }
  assert.equal(
    decide(sessionTool, { proposal_id: 'task_1', model: 'sonnet' })
      ?.permissionDecision,
    'deny',
  );
});

test('a session start without model is allowed', () => {
  assert.equal(decide(sessionTool, card), undefined);
  assert.equal(decide(sessionTool, { ...card, effort: 'high' }), undefined);
  assert.equal(decide(sessionTool, {}), undefined);
});

test('starting a proposal card by proposal_id alone is allowed', () => {
  assert.equal(
    decide(sessionTool, { proposal_id: 'task_05e66814' }),
    undefined,
  );
});

test('other tools are ignored, even with model set', () => {
  for (const tool of ['Agent', 'mcp__ccd_session__dismiss_task', 'Bash'])
    assert.equal(decide(tool, { ...card, model: 'sonnet' }), undefined, tool);
});

test('the deny is a PreToolUse permission decision', () => {
  const decision = decide(sessionTool, { ...card, model: 'sonnet' });
  assert.deepEqual(output(decision), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: decision.reason,
    },
  });
  assert.equal(output(undefined), undefined);
});

test('settings run the guard on start_session and block when it fails', () => {
  const settings = JSON.parse(
    readFileSync(new URL('../../.claude/settings.json', import.meta.url)),
  );
  const entry = settings.hooks.PreToolUse.find(
    ({ matcher }) => matcher === sessionTool,
  );
  assert.ok(entry, `no PreToolUse entry matches ${sessionTool}`);
  assert.equal(entry.hooks[0].onFailure, 'block');
  assert.match(entry.hooks[0].command, /session-model-guard\.mjs/);
});

test('the hook process denies, allows and fails closed on bad input', () => {
  const run = (event) =>
    spawnSync(process.execPath, [hook], { input: event, encoding: 'utf8' });
  const denied = run(
    JSON.stringify({
      tool_name: sessionTool,
      tool_input: { ...card, model: 'claude-sonnet-5-5' },
    }),
  );
  assert.equal(denied.status, 0, denied.stderr);
  assert.equal(
    JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision,
    'deny',
  );
  const allowed = run(
    JSON.stringify({ tool_name: sessionTool, tool_input: card }),
  );
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(allowed.stdout, '');
  assert.notEqual(run('not json').status, 0);
});
