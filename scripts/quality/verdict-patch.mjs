import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { changedPaths, patchIdOf } from './git.mjs';

const reviewOnly = [
  /\.md$/,
  /(^|\/)[^/]+\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)(tests|__tests__)\//,
  /^eslint\.config\.mjs$/,
  /^\.prettier(rc|ignore)/,
];

function git(args, { cwd } = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

export function filePatches(base, head, cwd) {
  const range = `${base}...${head}`;
  return new Map(
    changedPaths(range, cwd).map((file) => [
      file,
      patchIdOf(
        git(
          [
            'diff',
            '--binary',
            '--no-renames',
            range,
            '--',
            `:(literal)${file}`,
          ],
          { cwd },
        ),
        cwd,
      ),
    ]),
  );
}

export function wholePatchId(base, head, cwd) {
  return patchIdOf(
    git(['diff', '--binary', '--no-renames', `${base}...${head}`], { cwd }),
    cwd,
  );
}

export function compare(verdict, current) {
  const changed = [...new Set([...verdict.keys(), ...current.keys()])]
    .filter((file) => verdict.get(file) !== current.get(file))
    .sort();
  if (changed.length === 0) return { result: 'carries', changed };
  return {
    result: changed.every((file) => reviewOnly.some((rule) => rule.test(file)))
      ? 'docs-tests-only'
      : 're-verify',
    changed,
  };
}

const usage = `Usage:
  node scripts/quality/verdict-patch.mjs id [base] [head]
  node scripts/quality/verdict-patch.mjs check <verdict-base> <verdict-head> [base] [head]

base defaults to origin/main and head to HEAD.`;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, ...refs] = process.argv.slice(2);
  if (mode === 'id') {
    const [base = 'origin/main', head = 'HEAD'] = refs;
    console.info(`patch-id ${wholePatchId(base, head)} for ${base}...${head}`);
  } else if (mode === 'check' && refs.length >= 2) {
    const [verdictBase, verdictHead, base = 'origin/main', head = 'HEAD'] =
      refs;
    const unknown = [verdictBase, verdictHead, base, head].filter((ref) => {
      try {
        git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
        return false;
      } catch {
        return true;
      }
    });
    if (unknown.length) {
      console.error(`Unknown commit: ${unknown.join(', ')}. Fetch it first.`);
      process.exit(2);
    }
    const { result, changed } = compare(
      filePatches(verdictBase, verdictHead),
      filePatches(base, head),
    );
    console.info(result);
    for (const file of changed) console.info(`  ${file}`);
    if (result === 're-verify') process.exitCode = 1;
  } else {
    console.error(usage);
    process.exitCode = 2;
  }
}
