import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  developmentIdentity,
  localDevelopmentEnvironment,
  mobileRoot,
} from './configuration.mjs';

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--clear', '--web'].includes(arg))) {
    throw new Error(
      'JustGO Dev supports --clear and --web; its app scheme and LAN port are fixed.',
    );
  }
  const environment = await localDevelopmentEnvironment();
  const require = createRequire(
    new URL('../../apps/mobile/package.json', import.meta.url),
  );
  const child = spawn(
    process.execPath,
    [
      require.resolve('expo/bin/cli'),
      'start',
      '--dev-client',
      '--scheme',
      developmentIdentity.scheme,
      '--lan',
      '--port',
      '8081',
      '--max-workers',
      '1',
      ...args,
    ],
    {
      cwd: mobileRoot,
      env: {
        ...environment,
        NODE_OPTIONS:
          `${environment.NODE_OPTIONS ?? ''} --dns-result-order=ipv4first`.trim(),
      },
      stdio: 'inherit',
    },
  );
  child.on('error', () => {
    console.error('Unable to start JustGO Dev Metro.');
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => child.kill(signal));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
