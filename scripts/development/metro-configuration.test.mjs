import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { developmentEnvironment } from './configuration.mjs';
import { publicEnvironment } from './test-environment.mjs';

const configuration = new URL(
  '../../apps/mobile/metro.config.mjs',
  import.meta.url,
).href;
function resolve(environment) {
  const base = { ...process.env };
  for (const name of Object.keys(base))
    if (/^(?:JUSTGO_|EXPO_PUBLIC_|EAS_|CI$|GITHUB_ACTIONS$|VERCEL$)/.test(name))
      delete base[name];
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    const {default:config}=await import(${JSON.stringify(configuration)});
    const context={originModulePath:process.cwd()+'/apps/mobile/src/app-support/providers/AppProvider.tsx',resolveRequest:()=>({type:'sourceFile',filePath:'normal'})};
    console.log(JSON.stringify(['ios','web','android'].map(platform=>config.resolver.resolveRequest(context,'expo/virtual/env',platform).filePath)));
    console.log(config.resolver.resolveRequest(context,'other-module','ios').filePath);
  `,
    ],
    { env: { ...base, ...environment }, encoding: 'utf8', stdio: 'pipe' },
  );
}

test('only guarded local Dev maps public reads for every platform and chains other resolution', async () => {
  const environment = {
    ...(await developmentEnvironment(publicEnvironment())),
    NODE_ENV: 'development',
    JUSTGO_LOCAL_DEVELOPMENT: '1',
  };
  {
    const lines = resolve(environment).trim().split('\n');
    const paths = JSON.parse(lines[0]);
    assert(
      paths[0].endsWith('src/platform/environment/development-environment.ts'),
    );
    assert.equal(paths[1], paths[0]);
    assert.equal(paths[2], paths[0]);
    assert.equal(lines[1], 'normal');
  }
});

test('normal development and production retain Expo resolution; marked unsafe contexts fail closed', async () => {
  for (const NODE_ENV of ['development', 'production'])
    assert.equal(
      resolve({ NODE_ENV }).trim(),
      '["normal","normal","normal"]\nnormal',
    );
  const environment = {
    ...(await developmentEnvironment(publicEnvironment())),
    NODE_ENV: 'development',
    JUSTGO_LOCAL_DEVELOPMENT: '1',
  };
  for (const patch of [
    { NODE_ENV: 'production' },
    { JUSTGO_JOURNEY_FIXTURES: '1' },
    { CI: 'true' },
    { EXPO_PUBLIC_API_URL: 'https://wrong.invalid' },
    { EXPO_PUBLIC_SENTRY_ENABLED: 'true' },
  ])
    assert.throws(() => resolve({ ...environment, ...patch }));
});
