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

// Ignored local output and pstack plugin files live outside the tracked tree,
// unless the prefix names a tracked folder beside the doc or at the root.
const outsideRepoPrefixes = [
  '.local/',
  'pstack/',
  'poteto-mode/',
  'skills/',
  'playbooks/',
  'references/',
];

function staleMentions(file, markdown, files) {
  const basenames = new Set(
    [...files].map((name) => path.posix.basename(name)),
  );
  const bases = ['', path.posix.dirname(file)];
  const isTrackedFolder = (folder) =>
    [...files].some((name) => name.startsWith(folder));
  return withoutFences(markdown)
    .split('\n')
    .flatMap((line, index) =>
      /git history|\(planned\)/i.test(line)
        ? []
        : [...line.matchAll(markdownMention)].map(([name]) => ({
            name,
            line: index + 1,
          })),
    )
    .filter(({ name }) => {
      if (!name.includes('/')) {
        return !basenames.has(name);
      }
      if (bases.some((base) => files.has(path.posix.join(base, name)))) {
        return false;
      }
      const prefix = outsideRepoPrefixes.find((p) => name.startsWith(p));
      return (
        !prefix ||
        bases.some((base) => isTrackedFolder(path.posix.join(base, prefix)))
      );
    })
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

test('mention extraction resolves paths and names and skips code blocks, URLs, placeholders, history and (planned) notes, and outside-repo paths', () => {
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
        'Follow `playbooks/shipping.md` and `skills/swarm/SKILL.md`.',
        'Write the trial to `.local/edge-trial/report.md`.',
        'Create `docs/Planned.md` (planned).',
        'But `shipping.md` alone and `docs/Typo.md` still fail.',
      ].join('\n'),
      files,
    ),
    [
      'docs/guide/C.md:2 mentions docs/Gone.md',
      'docs/guide/C.md:2 mentions Missing.md',
      'docs/guide/C.md:13 mentions shipping.md',
      'docs/guide/C.md:13 mentions docs/Typo.md',
    ],
  );
});

test('mention extraction exempts only an explicit (planned) marker and checks prefixed paths that name a repo folder', () => {
  const files = new Set([
    '.claude/skills/verify/SKILL.md',
    'docs/A.md',
    'AGENTS.md',
  ]);
  assert.deepEqual(
    staleMentions(
      '.claude/C.md',
      [
        'As planned, see `docs/Old.md`.',
        'The Planned work moves `docs/Moved.md`.',
        'Create `docs/New.md` (Planned).',
        'Follow `skills/verify/SKILL.md`, not `skills/old/SKILL.md`.',
        'Pstack ships `playbooks/shipping.md` and `poteto-mode/SKILL.md`.',
      ].join('\n'),
      files,
    ),
    [
      '.claude/C.md:1 mentions docs/Old.md',
      '.claude/C.md:2 mentions docs/Moved.md',
      '.claude/C.md:4 mentions skills/old/SKILL.md',
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
      'Update each mention to the current file.',
      'A line that says "git history" may name a deleted file, and a line marked',
      '"(planned)" may name a file the plan will create.',
      'Write pstack plugin files with their folder (playbooks/x.md, skills/x/SKILL.md)',
      'and ignored output under .local/; those are outside the tracked tree.',
    ].join('\n'),
  );
});
