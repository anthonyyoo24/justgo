import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  developmentIdentity,
  developmentLaunchOptions,
  localDevelopmentEnvironment,
  mobileRoot,
} from './configuration.mjs';

try {
  const { expoArgs } = developmentLaunchOptions(process.argv.slice(2));
  const environment = await localDevelopmentEnvironment(process.env);
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
      ...expoArgs,
    ],
    {
      cwd: mobileRoot,
      env: {
        ...environment,
        JUSTGO_LOCAL_DEVELOPMENT: '1',
        EXPO_PUBLIC_JUSTGO_DEV_DIAGNOSTICS: '1',
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
