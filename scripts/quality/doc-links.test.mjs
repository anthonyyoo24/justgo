import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));

const markdownFiles = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '*.md'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter((file) => file && existsSync(path.join(root, file)));

const inlineLink =
  /!?\[[^\]]*\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g;
const referenceDefinition = /^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/gm;

function prose(markdown) {
  return markdown
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
}

function localTargets(markdown) {
  const text = prose(markdown);
  return [...text.matchAll(inlineLink), ...text.matchAll(referenceDefinition)]
    .map((match) => match[1] ?? match[2])
    .filter((target) => !/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(target))
    .map((target) => decodeURIComponent(target.replace(/[?#].*$/, '')))
    .filter(Boolean);
}

test('link extraction keeps relative targets and skips code, anchors, URLs and site-root paths', () => {
  assert.deepEqual(
    localTargets(
      [
        '[a](docs/A.md#part) ![b](<img one.png>) [c](https://x.dev)',
        '[d](#here) `[e](skip.md)` [f](mailto:a@b.c) [s](/privacy/)',
        '```',
        '[g](fenced.md)',
        '```',
        '[h]: ../H.md',
      ].join('\n'),
    ),
    ['docs/A.md', 'img one.png', '../H.md'],
  );
});

test('every local link in tracked Markdown points at a file that exists', () => {
  const broken = markdownFiles.flatMap((file) =>
    localTargets(readFileSync(path.join(root, file), 'utf8'))
      .filter(
        (target) => !existsSync(path.join(root, path.dirname(file), target)),
      )
      .map((target) => `${file} -> ${target}`),
  );
  assert.deepEqual(broken, [], `Broken local links:\n${broken.join('\n')}`);
});
