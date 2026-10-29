import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { builtinModules } from 'node:module';
import { productionPath, requireRelease } from './staging-api.mjs';

/** Inspect the actual esbuild inputs, not an optimistic source-copy allowlist. */
export function validateWorkerBundle({
  root,
  directory,
  metafile,
  tracked,
  inputRoot = root,
}) {
  const paths = Object.keys(metafile?.inputs ?? {});
  requireRelease(paths.length > 0, 'INVALID_API_UPLOAD');
  const repository = realpathSync(root);
  const locked = new Set(tracked);
  for (const input of paths) {
    if (input.startsWith('node-built-in-modules:')) {
      requireRelease(
        builtinModules.includes(input.slice('node-built-in-modules:'.length)),
        'UNSAFE_API_UPLOAD',
      );
      continue;
    }
    const absolute = resolve(inputRoot, input);
    const path = relative(repository, realpathSync(absolute));
    requireRelease(
      !path.startsWith('../') &&
        !isAbsolute(path) &&
        lstatSync(absolute).isFile(),
      'UNSAFE_API_UPLOAD',
    );
    const dependency =
      path.startsWith('node_modules/') &&
      !/(?:^|\/)(?:\.env[^/]*|test-support|__tests__)(?:\/|$)|\.(?:key|pem|p8|p12)$/.test(
        path,
      );
    requireRelease(
      dependency || (locked.has(path) && productionPath(path)),
      'UNSAFE_API_UPLOAD',
    );
  }
  const files = readdirSync(directory).sort();
  requireRelease(
    files.includes('worker.js') &&
      files.every((file) =>
        ['worker.js', 'worker.js.map', 'README.md'].includes(file),
      ),
    'API_UPLOAD_PATH_MISMATCH',
  );
  const entry = join(directory, 'worker.js');
  requireRelease(
    lstatSync(entry).isFile() && !lstatSync(entry).isSymbolicLink(),
    'UNSAFE_API_UPLOAD',
  );
  const content = readFileSync(entry);
  requireRelease(
    content.length > 0 && content.length <= 10 * 1024 * 1024,
    'INVALID_API_UPLOAD',
  );
  return {
    content,
    uploadSha256: createHash('sha256').update(content).digest('hex'),
  };
}

export async function buildStagingWorker({
  root,
  directory,
  target,
  context,
  env,
  signal,
  run,
}) {
  const version = JSON.parse(
    readFileSync(join(root, 'apps/api/package.json'), 'utf8'),
  ).devDependencies?.wrangler;
  requireRelease(version === '4.155.0', 'PINNED_WRANGLER_REQUIRED');
  const cli = join(root, 'node_modules/wrangler/bin/wrangler.js');
  requireRelease(
    (
      await run(process.execPath, [cli, '--version'], {
        cwd: root,
        env,
        signal,
      })
    ).trim() === version,
    'PINNED_WRANGLER_REQUIRED',
  );
  const { workerConfiguration } = await import(
    pathToFileURL(join(root, 'apps/api/cloudflare-config.mjs')).href
  );
  const config = workerConfiguration({
    environment: 'staging',
    hyperdriveId: target.hyperdriveId,
    sourceSha: context.sha,
    accountId: target.accountId,
  });
  requireRelease(
    config.name === target.worker &&
      config.account_id === target.accountId &&
      config.workers_dev === true &&
      config.observability?.enabled === false &&
      config.placement?.region === 'aws:ca-central-1' &&
      config.hyperdrive?.length === 1 &&
      config.hyperdrive[0]?.binding === 'HYPERDRIVE' &&
      config.hyperdrive[0]?.id === target.hyperdriveId &&
      config.compatibility_flags?.includes('nodejs_compat') &&
      config.preview_urls === true,
    'STAGING_WORKER_CONFIGURATION_MISMATCH',
  );
  // Resolve the source against its owning API directory before placing private config in RUNNER_TEMP.
  config.main = resolve(root, 'apps/api', config.main);
  // Bundle the tracked contracts sources; do not trust an ignored dist artifact.
  config.alias = {
    '@justgo/contracts': resolve(root, 'packages/contracts/src/index.ts'),
    '@justgo/contracts/openapi': resolve(
      root,
      'packages/contracts/src/openapi.ts',
    ),
  };
  const configPath = join(directory, 'wrangler.json');
  const output = join(directory, 'bundle');
  const metadataPath = join(directory, 'bundle-meta.json');
  writeFileSync(configPath, JSON.stringify(config), {
    mode: 0o600,
    flag: 'wx',
  });
  const buildEnv = {
    ...env,
    WRANGLER_SEND_METRICS: 'false',
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
  };
  delete buildEnv.CLOUDFLARE_API_TOKEN;
  await run(
    process.execPath,
    [
      cli,
      'deploy',
      '--config',
      configPath,
      '--dry-run',
      '--outdir',
      output,
      '--metafile',
      metadataPath,
    ],
    { cwd: root, env: buildEnv, signal },
  );
  const tracked = (await run('git', ['ls-files', '-z'], { cwd: root, signal }))
    .split('\0')
    .filter(Boolean);
  const bundle = validateWorkerBundle({
    root,
    inputRoot: directory,
    directory: output,
    metafile: JSON.parse(readFileSync(metadataPath, 'utf8')),
    tracked,
  });
  return { ...bundle, configuration: config };
}
