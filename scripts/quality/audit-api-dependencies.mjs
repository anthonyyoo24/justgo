import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const runtimeFields = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
];

function safePath(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    value.includes('\0') ||
    /^[a-z]:/i.test(value) ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value.split('/').includes('..')
  )
    throw new Error(`Invalid lockfile path: ${value}`);
  return value;
}

/** Preserve Node resolution and exact versions; never resolve a fresh install. */
export function apiProductionLock(lock, workspace = 'apps/api') {
  if (lock.lockfileVersion !== 3 || !lock.packages?.[workspace]?.name)
    throw new Error('Expected a v3 workspace lockfile');
  safePath(workspace);
  const selected = new Map();
  const workspaces = new Set();
  const visit = (location) => {
    safePath(location);
    if (selected.has(location)) return;
    const entry = lock.packages[location];
    if (!entry) throw new Error(`Missing locked package: ${location}`);
    // Global dev/optional/peer flags describe the entire monorepo. Every node
    // selected here is part of this production graph and must be audited.
    const copy = { ...entry };
    for (const field of [
      'dev',
      'devOptional',
      'optional',
      'peer',
      'devDependencies',
    ])
      delete copy[field];
    selected.set(location, copy);
    if (entry.link) {
      const target = safePath(entry.resolved);
      if (
        target.includes('node_modules') ||
        !lock.packages[target]?.name ||
        lock.packages[target].link
      )
        throw new Error(`Invalid workspace link: ${location}`);
      visit(target);
      return;
    }
    if (
      !location.startsWith('node_modules/') &&
      !location.includes('/node_modules/')
    )
      workspaces.add(location);
    const resolve = (name, optional = false) => {
      if (
        !/^(?:@[^/]+\/)?[^/]+$/.test(name) ||
        name
          .split('/')
          .some((part) => ['.', '..'].includes(part) || /[\\\0]/.test(part))
      )
        throw new Error(`Invalid dependency name: ${name}`);
      let parent = location;
      for (;;) {
        if (path.posix.basename(parent) !== 'node_modules') {
          const candidate = path.posix.join(parent, 'node_modules', name);
          if (lock.packages[candidate]) return visit(candidate);
        }
        if (!parent) break;
        parent = path.posix.dirname(parent);
        if (parent === '.') parent = '';
      }
      if (!optional)
        throw new Error(`Missing locked dependency ${name} for ${location}`);
    };
    const optional = entry.optionalDependencies ?? {};
    for (const name of Object.keys(entry.dependencies ?? {}))
      resolve(name, Object.hasOwn(optional, name));
    for (const name of Object.keys(optional)) resolve(name, true);
    for (const name of Object.keys(entry.peerDependencies ?? {})) {
      // An optional peer is a provider the consumer may choose. Include it when
      // selected by an actual dependency/required-peer edge, not merely because
      // an unrelated workspace happens to install that adapter.
      if (!entry.peerDependenciesMeta?.[name]?.optional) resolve(name);
    }
  };
  visit(workspace);
  for (const location of workspaces) {
    const name = lock.packages[location].name;
    const link = `node_modules/${name}`;
    if (!lock.packages[link]?.link || lock.packages[link].resolved !== location)
      throw new Error(`Missing workspace link: ${location}`);
    visit(link);
  }
  const root = {
    name: 'justgo-api-production-audit',
    version: '0.0.0',
    private: true,
    workspaces: [...workspaces].sort(),
  };
  return {
    ...root,
    lockfileVersion: 3,
    requires: true,
    packages: { '': root, ...Object.fromEntries(selected) },
  };
}

export const auditArguments = [
  'audit',
  '--workspace',
  '@justgo/api',
  '--package-lock-only',
  '--omit=dev',
  '--include=optional',
  '--include=peer',
  '--include-workspace-root=false',
  '--audit-level=low',
];

function npmAudit(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', auditArguments, { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal || code === null)
        reject(new Error('Dependency audit interrupted'));
      else resolve(code);
    });
  });
}

export async function auditApiDependencies(root, audit = npmAudit) {
  const lock = JSON.parse(
    await readFile(path.join(root, 'package-lock.json'), 'utf8'),
  );
  const projected = apiProductionLock(lock);
  const temporary = await mkdtemp(path.join(tmpdir(), 'justgo-api-audit-'));
  try {
    for (const location of projected.workspaces) {
      const manifest = JSON.parse(
        await readFile(path.join(root, location, 'package.json'), 'utf8'),
      );
      const entry = projected.packages[location];
      for (const field of ['name', 'version', ...runtimeFields])
        assert.deepEqual(
          manifest[field],
          entry[field],
          `Stale lockfile: ${location} ${field}`,
        );
      await mkdir(path.join(temporary, location), { recursive: true });
      await writeFile(
        path.join(temporary, location, 'package.json'),
        JSON.stringify(entry),
      );
    }
    await writeFile(
      path.join(temporary, 'package.json'),
      JSON.stringify(projected.packages['']),
    );
    await writeFile(
      path.join(temporary, 'package-lock.json'),
      JSON.stringify(projected),
    );
    console.log(
      `Auditing API production lock: ${Object.keys(projected.packages).length - 1} locked entries`,
    );
    return await audit(temporary);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );
  process.exitCode = await auditApiDependencies(root);
}
