import assert from 'node:assert/strict';
import test from 'node:test';
import { appJobsNeeded, classifyChanges } from './ci-changes.mjs';

test('only a change made entirely of Markdown skips the app jobs', () => {
  assert.equal(appJobsNeeded(['docs/README.md', 'AGENTS.md']), false);
  assert.equal(appJobsNeeded(['docs/TESTING.md', 'package.json']), true);
  assert.equal(appJobsNeeded(['apps/mobile/src/App.tsx']), true);
  assert.equal(appJobsNeeded(['docs/notes.mdx']), true);
  assert.equal(appJobsNeeded([]), true);
});

test('pushes, missing bases and unreadable diffs run every app job', () => {
  const docsOnly = () => ['README.md'];
  assert.equal(
    classifyChanges({ event: 'push', base: 'abc', listFiles: docsOnly }),
    true,
  );
  assert.equal(
    classifyChanges({ event: 'pull_request', base: '', listFiles: docsOnly }),
    true,
  );
  assert.equal(
    classifyChanges({
      event: 'pull_request',
      base: 'abc',
      listFiles: () => {
        throw new Error('bad revision');
      },
    }),
    true,
  );
  assert.equal(
    classifyChanges({
      event: 'pull_request',
      base: 'abc',
      listFiles: docsOnly,
    }),
    false,
  );
});
