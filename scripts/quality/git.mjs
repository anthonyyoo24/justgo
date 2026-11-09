import { execFileSync, spawnSync } from 'node:child_process';
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

// Merges two commits in memory, touching no worktree or index. Exit 1 means a
// conflict and lists the conflicted paths. Any other failure throws.
export function mergeTree(ours, theirs, cwd) {
  const result = spawnSync(
    'git',
    [
      'merge-tree',
      '--write-tree',
      '-z',
      '--name-only',
      '--no-messages',
      ours,
      theirs,
    ],
    { cwd, encoding: 'utf8' },
  );
  // A missing commit also exits 1, but prints no tree.
  const [tree, ...conflicts] = (result.stdout ?? '')
    .split('\0')
    .filter(Boolean);
  if (
    (result.status !== 0 && result.status !== 1) ||
    !/^[0-9a-f]{40,64}$/.test(tree ?? '')
  )
    throw new Error(
      `git merge-tree ${ours} ${theirs} failed: ${result.stderr || result.error}`,
    );
  return {
    tree,
    clean: result.status === 0,
    conflicts: [...new Set(conflicts)],
  };
}

export function patchIdOf(diff, cwd) {
  const id = execFileSync('git', ['patch-id', '--verbatim'], {
    cwd,
    input: diff,
    encoding: 'utf8',
  }).split(' ')[0];
  return id || createHash('sha1').update(diff).digest('hex');
}
