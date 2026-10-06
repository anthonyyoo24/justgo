import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const config = new URL('../apps/mobile/metro.config.mjs', import.meta.url).href;
function load(extra, script) {
  const environment = { ...process.env };
  delete environment.JUSTGO_JOURNEY_FIXTURES;
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
        `const {default:metro}=await import('expo/metro-config.js'); console.log(config.resolver.resolveRequest === metro.getDefaultConfig(process.cwd() + '/apps/mobile').resolver.resolveRequest);`,
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
test('isolated web provider resolves the fault adapter; native and other callers retain normal storage', () => {
  const output = load(
    {
      JUSTGO_JOURNEY_FIXTURES: '1',
      NODE_ENV: 'test',
      DATABASE_URL:
        'postgresql://justgo_runtime:fixture@127.0.0.1:54329/justgo_test',
      MIGRATION_DATABASE_URL:
        'postgresql://justgo_migrator:fixture@127.0.0.1:54329/justgo_test',
      DATABASE_SSL: 'disable',
    },
    `
 const origin=new URL(${JSON.stringify(new URL('../apps/mobile/src/app-support/providers/AppProvider.tsx', import.meta.url).href)}).pathname;
 const context={originModulePath:origin,resolveRequest:()=>({type:'sourceFile',filePath:'normal'})};
 console.log(config.resolver.resolveRequest(context,'../../data/activity/storage','web').filePath.endsWith('test-support/journey-storage.ts'));
 console.log(config.resolver.resolveRequest(context,'../../data/activity/storage','ios').filePath);
 console.log(config.resolver.resolveRequest({...context,originModulePath:'another'},'../../data/activity/storage','web').filePath);
 `,
  );
  assert.equal(output.trim(), 'true\nnormal\nnormal');
});
