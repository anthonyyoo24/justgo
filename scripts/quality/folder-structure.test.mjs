import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const guide = readFileSync(
  path.join(root, 'docs/architecture/FOLDER_STRUCTURE.md'),
  'utf8',
);
const listedPaths = [
  ...guide.matchAll(
    /^\|\s*((?:apps|packages|e2e|scripts|design|docs)\/[^|]*?)\s*\|/gm,
  ),
].map((match) => match[1].trim());
const requiredOwners = [
  'apps/mobile/src/app/(challenge)/',
  'apps/mobile/src/app/account/',
  'apps/mobile/src/app-support/identity/account/',
  'apps/mobile/src/features/settings/',
  'apps/mobile/src/features/challenges/deck/',
  'apps/mobile/src/features/challenges/active/',
  'apps/mobile/src/features/challenges/success/',
  'apps/mobile/src/data/activity/progress/',
  'apps/mobile/src/lib/network/',
  'apps/mobile/src/platform/connectivity/',
  'apps/mobile/src/platform/modals/',
  'apps/mobile/src/dev/previews/challenges/',
  'apps/api/src/http/',
  'apps/api/src/account-export/',
];
const missingPaths = (exists) =>
  listedPaths.filter((owner) => !exists(path.join(root, owner)));

test('the implemented folder guide names each approved responsibility and every listed path exists', () => {
  for (const owner of requiredOwners)
    assert.ok(
      listedPaths.includes(owner),
      `Missing owner in folder guide: ${owner}`,
    );
  assert.deepEqual(missingPaths(existsSync), []);
});

test('a missing documented owner fails the architecture check', () => {
  const missingOwner = path.join(root, requiredOwners[5]);
  assert.deepEqual(
    missingPaths(
      (candidate) => candidate !== missingOwner && existsSync(candidate),
    ),
    [requiredOwners[5]],
  );
});
