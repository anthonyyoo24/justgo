import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('native smoke command', () => {
  let fixture: string;
  let capture: string;

  beforeEach(() => {
    fixture = mkdtempSync(join(tmpdir(), 'justgo-maestro-'));
    capture = join(fixture, 'args.json');
    // Capture the CLI boundary without requiring Maestro or a running simulator.
    writeFileSync(
      join(fixture, 'maestro'),
      `#!/usr/bin/env node
require('node:fs').writeFileSync(process.env.ARG_CAPTURE, JSON.stringify(process.argv.slice(2)));
process.exit(Number(process.env.MAESTRO_TEST_EXIT || 0));
`,
      { mode: 0o755 },
    );
  });

  afterEach(() => rmSync(fixture, { recursive: true, force: true }));

  function run(appId?: string, exitCode = '0') {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${fixture}:${process.env.PATH}`,
      ARG_CAPTURE: capture,
      MAESTRO_TEST_EXIT: exitCode,
    };
    delete env.APP_ID;
    if (appId !== undefined) env.APP_ID = appId;
    return spawnSync('npm', ['run', 'test:native', '--silent'], {
      cwd: __dirname,
      env,
      encoding: 'utf8',
      timeout: 10000,
    });
  }

  it.each([undefined, ''])(
    'rejects a missing or empty app ID (%s)',
    (appId) => {
      const result = run(appId);
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Set APP_ID');
      expect(existsSync(capture)).toBe(false);
    },
  );

  it('passes the app ID as one explicit Maestro parameter without shell evaluation', () => {
    const appId = 'dev.justgo.fixture $(echo unexpected)';
    const result = run(appId);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(capture, 'utf8'))).toEqual([
      'test',
      '-e',
      `APP_ID=${appId}`,
      'e2e/launch.yaml',
    ]);
  });

  it('reports a failed Maestro run as a failed npm command', () => {
    const result = run('dev.justgo.foundation', '7');
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(7);
  });
});
