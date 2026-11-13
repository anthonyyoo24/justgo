// Decides whether a fixture-port listener belongs to the services bin/verify serve
// recorded. serve.ts starts each service as a process group leader, but pnpm 11
// runs a script's shell in a new process group, so the listener can sit in a
// group of its own below the recorded pid (#467).
import { execFileSync } from 'node:child_process';

export type Listener = { pid: number; group: number; cwd?: string | undefined };

export function parentPid(pid: number) {
  try {
    return Number(
      execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim(),
    );
  } catch {
    return 0;
  }
}

export function descendsFrom(
  pid: number,
  ancestors: ReadonlySet<number>,
  parentOf: (pid: number) => number = parentPid,
) {
  const seen = new Set<number>();
  for (let current = pid; current > 1 && !seen.has(current);) {
    if (ancestors.has(current)) return true;
    seen.add(current);
    current = parentOf(current);
  }
  return false;
}

export function ownedListener(
  { pid, group, cwd }: Listener,
  recorded: ReadonlySet<number>,
  root: string,
  parentOf: (pid: number) => number = parentPid,
) {
  if (!cwd?.startsWith(root)) return false;
  return recorded.has(group) || descendsFrom(pid, recorded, parentOf);
}
