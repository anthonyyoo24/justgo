import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { journeyServiceUrls } from '../../e2e/support/environment.ts';
const config = new URL('../../apps/mobile/metro.config.mjs', import.meta.url)
  .href;
function load(extra, script) {
  const environment = { ...process.env };
  delete environment.JUSTGO_JOURNEY_FIXTURES;
  delete environment.JUSTGO_JOURNEY_API_PORT;
  delete environment.JUSTGO_JOURNEY_APP_PORT;
  delete environment.VERCEL;
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const {default:config}=await import(${JSON.stringify(config)});${script}`,
    ],
    { env: { ...environment, ...extra }, encoding: 'utf8', stdio: 'pipe' },
  );
}
test('normal and production Metro builds do not enable journey storage injection', () => {
  for (const NODE_ENV of ['development', 'production'])
    assert.equal(
      load(
        { NODE_ENV },
        `const context={originModulePath:process.cwd()+'/apps/mobile/src/app-support/providers/AppProvider.tsx',resolveRequest:()=>({type:'sourceFile',filePath:'normal'})}; console.log(config.resolver.resolveRequest(context,'../../data/activity/persistence/storage','web').filePath === 'normal');`,
      ).trim(),
      'true',
    );
});
test('journey Metro refuses missing database guards and production deployment', () => {
  for (const extra of [
    { DATABASE_URL: '', MIGRATION_DATABASE_URL: '' },
    { NODE_ENV: 'production' },
    { VERCEL: '1' },
  ])
    assert.throws(() => load({ JUSTGO_JOURNEY_FIXTURES: '1', ...extra }, ''));
});
for (const ports of [
  {},
  { JUSTGO_JOURNEY_API_PORT: '3002', JUSTGO_JOURNEY_APP_PORT: '8083' },
]) {
  const { api } = journeyServiceUrls(ports);
  test(`isolated web provider resolves fault adapters at ${api}; native and other callers retain normal storage`, () => {
    const output = load(
      {
        JUSTGO_JOURNEY_FIXTURES: '1',
        NODE_ENV: 'test',
        DATABASE_URL:
          'postgresql://justgo_runtime:fixture@127.0.0.1:54329/justgo_test',
        MIGRATION_DATABASE_URL:
          'postgresql://justgo_migrator:fixture@127.0.0.1:54329/justgo_test',
        DATABASE_SSL: 'disable',
        ...ports,
        EXPO_PUBLIC_API_URL: api,
      },
      `
 const origin=new URL(${JSON.stringify(new URL('../../apps/mobile/src/app-support/providers/AppProvider.tsx', import.meta.url).href)}).pathname;
 const context={originModulePath:origin,resolveRequest:()=>({type:'sourceFile',filePath:'normal'})};
 console.log(config.resolver.resolveRequest(context,'../../data/activity/persistence/storage','web').filePath.endsWith('test-support/journey-storage.ts'));
 console.log(config.resolver.resolveRequest(context,'../../data/activity/persistence/storage','ios').filePath);
 console.log(config.resolver.resolveRequest({...context,originModulePath:'another'},'../../data/activity/persistence/storage','web').filePath);
 console.log(config.resolver.resolveRequest(context,'expo/virtual/env','web').filePath.endsWith('test-support/journey-environment.ts'));
 console.log(config.resolver.resolveRequest(context,'expo/virtual/env','ios').filePath);
 `,
    );
    assert.equal(output.trim(), 'true\nnormal\nnormal\ntrue\nnormal');
  });
}
for (const api of ['https://hosted.example', 'http://127.0.0.1:3000']) {
  test(`journey Metro rejects ${api} when configured for another loopback API`, () => {
    assert.throws(
      () =>
        load(
          {
            JUSTGO_JOURNEY_FIXTURES: '1',
            NODE_ENV: 'test',
            DATABASE_URL:
              'postgresql://justgo_runtime:fixture@127.0.0.1:54329/justgo_test',
            MIGRATION_DATABASE_URL:
              'postgresql://justgo_migrator:fixture@127.0.0.1:54329/justgo_test',
            DATABASE_SSL: 'disable',
            JUSTGO_JOURNEY_API_PORT: '3002',
            JUSTGO_JOURNEY_APP_PORT: '8083',
            EXPO_PUBLIC_API_URL: api,
          },
          '',
        ),
      (error) =>
        error instanceof Error &&
        'stderr' in error &&
        String(error.stderr).includes(
          'Journey fixtures require the isolated loopback API URL',
        ),
    );
  });
}
