import {
  runLocalStagingRelease,
  usage,
} from '../../../scripts/release/staging-local.mjs';

// The Mac only dispatches the protected workflow. It deploys nothing itself.
try {
  await runLocalStagingRelease(process.argv.slice(2));
} catch (error) {
  // A release failure's message is its closed code, never provider text.
  const code = error instanceof Error ? error.message : 'FAILED';
  console.error(JSON.stringify({ event: 'staging_local_failed', code }));
  if (code === 'INVALID_LOCAL_STAGING_CONTEXT') console.error(usage);
  process.exitCode = 1;
}
