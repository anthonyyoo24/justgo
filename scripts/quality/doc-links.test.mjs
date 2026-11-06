import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

const workingFiles = git([
  'ls-files',
  '-z',
  '--cached',
  '--others',
  '--exclude-standard',
])
  .split('\0')
  .filter((file) => file && existsSync(path.join(root, file)));

const markdownFiles = workingFiles.filter((file) => file.endsWith('.md'));

const inlineLink =
  /!?\[[^\]]*\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g;
const referenceDefinition = /^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/gm;

function withoutFences(markdown) {
  return markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (block) =>
    block.replace(/[^\n]/g, ''),
  );
}

function prose(markdown) {
  return withoutFences(markdown).replace(/`[^`\n]*`/g, '');
}

function localTargets(markdown) {
  const text = prose(markdown);
  return [...text.matchAll(inlineLink), ...text.matchAll(referenceDefinition)]
    .map((match) => match[1] ?? match[2])
    .filter((target) => !/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(target))
    .map((target) => decodeURIComponent(target.replace(/[?#].*$/, '')))
    .filter(Boolean);
}

// A mention starts after whitespace or Markdown punctuation, so URLs, home
// paths and placeholder suffixes such as `<run>.review.md` never match.
const markdownMention = /(?<=^|[\s`'"([|*])[\w./-]*[\w-]\.md(?![\w-])/gm;

const mentionsOutsideRepo = new Map([
  [
    'poteto-mode/playbooks/worktree-cleanup.md',
    'pstack plugin playbook, shipped outside this repository',
  ],
]);

function staleMentions(file, markdown, files) {
  const basenames = new Set(
    [...files].map((name) => path.posix.basename(name)),
  );
  return withoutFences(markdown)
    .split('\n')
    .flatMap((line, index) =>
      /git history/i.test(line)
        ? []
        : [...line.matchAll(markdownMention)].map(([name]) => ({
            name,
            line: index + 1,
          })),
    )
    .filter(({ name }) => !mentionsOutsideRepo.has(name))
    .filter(({ name }) =>
      name.includes('/')
        ? ![name, path.posix.join(path.posix.dirname(file), name)].some(
            (candidate) => files.has(path.posix.normalize(candidate)),
          )
        : !basenames.has(name),
    )
    .map(({ name, line }) => `${file}:${line} mentions ${name}`);
}

// DOC_MENTIONS_REV replays the mention check against a past commit's tree,
// which proves it catches mentions that once reached main.
function mentionSnapshot() {
  const rev = process.env.DOC_MENTIONS_REV;
  if (!rev) {
    return {
      files: new Set(workingFiles),
      markdown: markdownFiles.map((file) => [
        file,
        readFileSync(path.join(root, file), 'utf8'),
      ]),
    };
  }
  const files = git(['ls-tree', '-r', '-z', '--name-only', rev])
    .split('\0')
    .filter(Boolean);
  return {
    files: new Set(files),
    markdown: files
      .filter((file) => file.endsWith('.md'))
      .map((file) => [file, git(['show', `${rev}:${file}`])]),
  };
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

test('mention extraction resolves paths and names and skips code blocks, URLs, placeholders and history notes', () => {
  const files = new Set(['docs/A.md', 'docs/guide/B.md', 'README.md']);
  assert.deepEqual(
    staleMentions(
      'docs/guide/C.md',
      [
        'See `docs/A.md`, ../A.md, ./B.md, **README.md** and docs/A.md:12.',
        'Gone: `docs/Gone.md` and Missing.md, but not x.mdx or B.md.',
        '[link](https://x.dev/Remote.md) ~/notes/Home.md `<run>.review.md`',
        '`phase-*.md` and {name}.md are patterns.',
        'The old Retired.md is in git history at `abc123`.',
        '```',
        'Fenced.md',
        '```',
        'poteto-mode/playbooks/worktree-cleanup.md',
      ].join('\n'),
      files,
    ),
    [
      'docs/guide/C.md:2 mentions docs/Gone.md',
      'docs/guide/C.md:2 mentions Missing.md',
    ],
  );
});

test('every Markdown file mentioned in tracked Markdown exists', () => {
  const { files, markdown } = mentionSnapshot();
  const stale = markdown.flatMap(([file, text]) =>
    staleMentions(file, text, files),
  );
  assert.deepEqual(
    stale,
    [],
    [
      'Markdown mentions a .md file that does not exist:',
      ...stale,
      'Update each mention to the current file, or, if the file legitimately lives',
      'outside this repo, add it to mentionsOutsideRepo in',
      'scripts/quality/doc-links.test.mjs with its reason.',
      'A line that says "git history" may name a deleted file.',
    ].join('\n'),
  );
});
