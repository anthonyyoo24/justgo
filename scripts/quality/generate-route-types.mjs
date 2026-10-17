import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const mobileRoot = fileURLToPath(new URL('../../apps/mobile', import.meta.url));

export function generateRouteTypes({
  projectRoot = mobileRoot,
  run = spawnSync,
} = {}) {
  const declaration = resolve(projectRoot, '.expo/types/router.d.ts');
  // Expo can report a prerequisite/generation failure without a nonzero exit.
  // A previous declaration must never make that failure appear successful.
  rmSync(declaration, { force: true });
  const result = run(
    process.execPath,
    [require.resolve('expo/bin/cli'), 'customize', 'tsconfig.json'],
    {
      cwd: projectRoot,
      env: { ...process.env, CI: '1' },
      stdio: 'inherit',
      timeout: 60_000,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error('Expo route type generation failed.');
  let contents;
  try {
    contents = readFileSync(declaration, 'utf8');
  } catch {
    throw new Error('Expo did not generate .expo/types/router.d.ts.');
  }
  if (!contents.includes("declare module 'expo-router'"))
    throw new Error('Expo generated an invalid route declaration.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  generateRouteTypes();
