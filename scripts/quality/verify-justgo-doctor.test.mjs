import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import {
  descendsFrom,
  ownedListener,
} from '../../.claude/skills/verify-justgo/bin/ownership.ts';

const root = '/work/justgo';
const groupOf = (pid) =>
  Number(
    execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], {
      encoding: 'utf8',
    }),
  );

// serve.ts records a detached group leader. pnpm 11 then runs the script's
// shell in a new process group, so `expo start` listens from a group of its own.
const launcher = `
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore',
  });
  process.stdout.write(child.pid + '\\n');
  setInterval(() => {}, 1000);
`;

test('#467: owns a listener in its own process group below the recorded pid', async (t) => {
  const leader = spawn(process.execPath, ['-e', launcher], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const [line] = await once(leader.stdout, 'data');
  const listener = Number(String(line).trim());
  t.after(() => {
    for (const pid of [listener, leader.pid]) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
  });

  const group = groupOf(listener);
  assert.equal(groupOf(leader.pid), leader.pid);
  assert.notEqual(group, leader.pid, 'the listener left the recorded group');

  const recorded = new Set([leader.pid]);
  assert.equal(
    ownedListener(
      { pid: listener, group, cwd: `${root}/apps/mobile` },
      recorded,
      root,
    ),
    true,
  );
  assert.equal(
    ownedListener(
      { pid: listener, group, cwd: '/elsewhere/justgo' },
      recorded,
      root,
    ),
    false,
    'a descendant outside the checkout stays foreign',
  );
  assert.equal(
    ownedListener(
      { pid: process.pid, group: groupOf(process.pid), cwd: root },
      recorded,
      root,
    ),
    false,
    'a process that does not descend from a recorded pid stays foreign',
  );
});

test('owns a listener in a recorded group even after its parent exits', () => {
  assert.equal(
    ownedListener(
      { pid: 40, group: 30, cwd: root },
      new Set([30]),
      root,
      () => 1,
    ),
    true,
  );
});

test('stops at the root of the process tree and on a parent cycle', () => {
  const parents = new Map([
    [40, 41],
    [41, 40],
    [50, 1],
  ]);
  const parentOf = (pid) => parents.get(pid) ?? 0;
  assert.equal(descendsFrom(40, new Set([30]), parentOf), false);
  assert.equal(descendsFrom(50, new Set([1]), parentOf), false);
  assert.equal(descendsFrom(41, new Set([40]), parentOf), true);
});
