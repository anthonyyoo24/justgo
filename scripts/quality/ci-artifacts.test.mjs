import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const workflow = readFileSync(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);
const steps = workflow.split(/^ {6}- /m).slice(1);
const collection = steps.find((step) =>
  step.includes('run: npm run test:coverage\n'),
);
const upload = steps.find((step) =>
  step.startsWith('name: Upload coverage reports\n'),
);

function property(step, name) {
  return step?.match(new RegExp(`^        ${name}: (.+)$`, 'm'))?.[1];
}

// This workflow expression uses the shared JavaScript/GitHub Actions subset.
// Read the real condition so reverting to always() reproduces the skipped-step bug.
for (const [outcome, expected] of [
  ['success', true],
  ['failure', true],
  ['skipped', false],
  ['cancelled', false],
  [undefined, false],
]) {
  test(`coverage upload eligibility after collection outcome ${outcome}`, () => {
    const condition = property(upload, 'if');
    assert.ok(condition, 'coverage upload needs an explicit condition');
    const coverageId = property(collection, 'id') ?? 'coverage';
    const eligible = runInNewContext(condition, {
      // A prior check may have failed, but completed coverage still needs upload.
      always: () => true,
      steps: { [coverageId]: { outcome } },
    });
    assert.equal(eligible, expected);
  });
}

test('coverage uploads retain missing-report failures and reference their producing step', () => {
  assert.ok(property(collection, 'id'), 'coverage collection needs a step id');
  assert.match(upload, /^ {10}if-no-files-found: error$/m);
  assert.match(upload, /^ {10}path: coverage\/$/m);
});
