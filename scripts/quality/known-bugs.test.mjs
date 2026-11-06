import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));

// .mjs tests run on node:test, which has no `.failing`. Skipping them also
// keeps the fixtures below from flagging this file.
const testFiles = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(
    (file) =>
      /\.(?:test|spec)\.[jt]sx?$/.test(file) &&
      existsSync(path.join(root, file)),
  );

const knownBug =
  /\b(?:it|test)(?:\.(?:only|skip|concurrent))*\.failing(?:\s*\(|\.each\s*[(`])/g;
const issueReference =
  /(?:^|[^\w&])#\d+\b|github\.com\/anthonyyoo24\/justgo\/issues\/\d+\b/;
const commentLine = /^\s*(?:\/\/|\/\*|\*)/;

function unreferencedKnownBugs(source) {
  const lines = source.split('\n');
  return [...source.matchAll(knownBug)].flatMap((match) => {
    const line = source.slice(0, match.index).split('\n').length - 1;
    if (commentLine.test(lines[line])) return [];
    let above = line;
    while (above > 0 && commentLine.test(lines[above - 1])) above -= 1;
    const comments = lines.slice(above, line).join('\n');
    const title = source.slice(match.index).split(/=>|\bfunction\b|[{;]/)[0];
    return issueReference.test(comments) || issueReference.test(title)
      ? []
      : [line + 1];
  });
}

test('a known-bug test without an issue reference is reported by line', () => {
  assert.deepEqual(
    unreferencedKnownBugs(
      [
        "it('passes', () => {});",
        "it.failing('drops the row', async () => {});",
        '// Issue #12: the row drops on resume.',
        '',
        "test.failing('loses the draft', () => {});",
        '// https://github.com/someone/else/issues/12',
        "test.failing('keeps the draft', () => {});",
        "it.failing.each([1, 2])('drops row %i', (row) => {});",
      ].join('\n'),
    ),
    [2, 5, 7, 8],
  );
});

test('an issue number or URL in the title or the comment above counts', () => {
  assert.deepEqual(
    unreferencedKnownBugs(
      [
        "it.failing('drops the row (#12)', async () => {});",
        '// The row drops on resume.',
        '// https://github.com/anthonyyoo24/justgo/issues/12',
        'it.failing(',
        "  'drops the row',",
        '  async () => {},',
        ');',
        'describe(() => {',
        '  /*',
        '   * Issue #12',
        '   */',
        "  test.only.failing('drops the row', () => {});",
        '});',
        "it.failing.each([1, 2])('drops row %i (#12)', (row) => {});",
        '// Change `it.failing` to `it` once #12 is fixed.',
      ].join('\n'),
    ),
    [],
  );
});

test('every known-bug test in tracked test files names its issue', () => {
  const unreferenced = testFiles.flatMap((file) =>
    unreferencedKnownBugs(readFileSync(path.join(root, file), 'utf8')).map(
      (line) => `${file}:${line}`,
    ),
  );
  assert.deepEqual(
    unreferenced,
    [],
    `Name the GitHub issue (#NNN or its URL) in the title or the comment above:\n${unreferenced.join('\n')}`,
  );
});
