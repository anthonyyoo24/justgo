import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { jobs, steps, property } from './ci-workflow-fixture.mjs';

for (const [name, job] of Object.entries(jobs)) {
  for (const upload of steps(job).filter((step) =>
    /^name: Upload .*coverage/m.test(step),
  )) {
    const condition = property(upload, 'if');
    const producerId = condition?.match(/steps\.([\w-]+)\.outcome/)?.[1];
    const collection = steps(job).find(
      (step) => property(step, 'id') === producerId,
    );
    test(`${name}/${producerId} uploads only executed coverage and fails on missing reports`, () => {
      assert.ok(collection, 'coverage upload references a producing step');
      assert.match(upload, /^ {10}if-no-files-found: error$/m);
      for (const [outcome, expected] of [
        ['success', true],
        ['failure', true],
        ['skipped', false],
        ['cancelled', false],
        [undefined, false],
      ]) {
        // GitHub permits hyphens in property names; normalize that lexical difference.
        const expression = condition.replace(/steps\.([\w-]+)/g, 'steps["$1"]');
        assert.equal(
          runInNewContext(expression, {
            always: () => true,
            steps: { [producerId]: { outcome } },
          }),
          expected,
        );
      }
    });
  }
}

test('the final job requires both API producers and preserves workspace report paths', () => {
  for (const artifact of ['coverage-mobile', 'coverage-contracts'])
    assert.match(jobs.checks, new RegExp(`name: ${artifact}`));
  assert.match(jobs.checks, /pattern: coverage-api-\*/);
  assert.match(jobs.checks, /merge-multiple: true/);
  assert.match(jobs.checks, /path: coverage\/mobile\//);
  assert.match(jobs.checks, /path: coverage\/contracts\//);
  assert.match(jobs.unit, /coverage\/api-blobs\/unit.json/);
  assert.match(jobs.database, /coverage\/api-blobs\/database.json/);
});

test('journey and exported-build reports retain hidden artifact paths and required HTML output', () => {
  for (const [name, prefix] of [
    ['journeys', 'journey'],
    ['exports', 'exported-web'],
  ]) {
    assert.match(
      jobs[name],
      new RegExp(`test -s \\.local/${prefix}-report/index.html`),
    );
    assert.match(jobs[name], new RegExp(`\\.local/${prefix}-results/`));
    assert.match(jobs[name], new RegExp(`\\.local/${prefix}-report/`));
    assert.match(jobs[name], /include-hidden-files: true/);
  }
});
