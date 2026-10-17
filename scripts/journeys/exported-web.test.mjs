import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { exportedWebServer } from './serve-exported-web.mjs';

test('export serving falls back only for app routes and serves assets with their real MIME type', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'justgo-export-'));
  const server = exportedWebServer(directory);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });
  writeFileSync(join(directory, 'index.html'), '<html>App</html>');
  writeFileSync(join(directory, 'app.js'), 'export default 1;');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const route = await fetch(origin + '/account/recover');
  assert.match(route.headers.get('content-type'), /text\/html/);
  assert.equal(await route.text(), '<html>App</html>');
  const script = await fetch(origin + '/app.js');
  assert.match(script.headers.get('content-type'), /text\/javascript/);
  assert.equal(await script.text(), 'export default 1;');
  for (const path of [
    '/missing.js',
    '/v1/sessions',
    '/.env',
    '/%2e%2e%2fsecret',
  ])
    assert.ok((await fetch(origin + path)).status >= 400, path);
  assert.equal((await fetch(origin, { method: 'POST' })).status, 405);
});
