import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { descriptionProblems } from './pr-description.mjs';

const script = fileURLToPath(new URL('./pr-description.mjs', import.meta.url));
const workflow = readFileSync(
  new URL('../../.github/workflows/pr-description.yml', import.meta.url),
  'utf8',
);

const complete = [
  '## Why',
  'The reason.',
  '## What changed',
  '- A change.',
  '## Scope',
  '- What it leaves out.',
  '## Blast Radius',
  'Docs only.',
  '## Verification',
  '- A real run.',
  '',
  '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
].join('\n');

test('a complete pstack description passes', () => {
  assert.deepEqual(descriptionProblems(complete), []);
});

test('each missing required section is named with its fix', () => {
  assert.deepEqual(descriptionProblems(complete.replace('## Scope\n', '')), [
    'Add a "## Scope" section.',
  ]);
  assert.equal(descriptionProblems('').length, 3);
  assert.deepEqual(
    descriptionProblems(complete.replace('## What changed\n- A change.\n', '')),
    [],
  );
});

test('an empty required section fails', () => {
  assert.deepEqual(
    descriptionProblems(complete.replace('The reason.', '   ')),
    ['Fill in the "## Why" section.'],
  );
});

test('sections out of pstack order fail', () => {
  const swapped = complete
    .replace('## Why\nThe reason.', '## Scope\n- What it leaves out.')
    .replace(
      '## Scope\n- What it leaves out.\n## Blast',
      '## Why\nThe reason.\n## Blast',
    );
  assert.match(
    descriptionProblems(swapped).at(-1),
    /^Reorder the sections to: Why/,
  );
});

test('the CLI fails with the fix in its message and passes a complete body', () => {
  const run = (body) =>
    spawnSync(process.execPath, [script], {
      env: { ...process.env, PR_BODY: body },
      encoding: 'utf8',
    });
  const failed = run('## Why\nOnly a reason.');
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Add a "## Verification" section\./);
  assert.match(failed.stderr, /pstack PR sections, in order/);
  assert.equal(run(complete).status, 0);
});

test('the workflow runs the check on every description change except Dependabot', () => {
  assert.match(workflow, /types: \[opened, edited, reopened, synchronize\]/);
  assert.match(
    workflow,
    /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/,
  );
  assert.match(workflow, /run: node scripts\/quality\/pr-description\.mjs/);
  assert.match(workflow, /user\.login != 'dependabot\[bot\]'/);
  assert.match(workflow, /persist-credentials: false/);
  for (const [, reference] of workflow.matchAll(/uses: (\S+)/g))
    assert.match(reference, /^actions\/[\w-]+@[a-f0-9]{40}$/);
});

test('headings inside code blocks are ignored', () => {
  const quoted = complete.replace(
    'The reason.',
    'The reason.\n\n```md\n## Why\n## Verification\n```',
  );
  assert.deepEqual(descriptionProblems(quoted), []);
  const fencedOnly = complete.replace(
    '## Verification\n- A real run.',
    '```\n## Verification\n```',
  );
  assert.deepEqual(descriptionProblems(fencedOnly), [
    'Add a "## Verification" section.',
  ]);
  const earlyClose = complete.replace(
    '## Verification\n- A real run.',
    '```\n```js\n## Verification\n```',
  );
  assert.deepEqual(descriptionProblems(earlyClose), [
    'Add a "## Verification" section.',
  ]);
});

test('a near-miss heading is named as a rename', () => {
  assert.deepEqual(
    descriptionProblems(
      complete.replace('## Verification', '## Verification (local)'),
    ),
    ['Rename "## Verification (local)" to "## Verification".'],
  );
});
