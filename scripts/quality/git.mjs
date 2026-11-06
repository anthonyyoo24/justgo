import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Default diff output pairs renames into the new name and quotes non-ASCII
// paths, and `patch-id --stable` ignores whitespace. Each opened a merge gate.
export function changedPaths(range, cwd) {
  return execFileSync(
    'git',
    ['diff', '--name-only', '-z', '--no-renames', range],
    { cwd, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
}

export function patchIdOf(diff, cwd) {
  const id = execFileSync('git', ['patch-id', '--verbatim'], {
    cwd,
    input: diff,
    encoding: 'utf8',
  }).split(' ')[0];
  return id || createHash('sha1').update(diff).digest('hex');
}
