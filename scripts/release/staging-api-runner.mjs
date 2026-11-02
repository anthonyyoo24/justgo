import { pathToFileURL } from 'node:url';
import { releaseContext } from './staging-api.mjs';
import { runStagingDeployment } from './staging-api-deployment.mjs';
export { requireRelease } from './staging-api.mjs';

export {
  privateCommand,
  validateHyperdrive,
  StagingRunnerFailure,
  stagingRunnerFailureCode,
  stagingRunnerPromotionDiagnostic,
} from './staging-api-deployment.mjs';

/** The protected GitHub entry retains its main-only context requirements. */
export async function stagingApi(operation, options = {}) {
  const env = options.env ?? process.env;
  return runStagingDeployment(operation, {
    ...options,
    env,
    context: releaseContext(env),
    provenance: 'GitHub',
  });
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    console.info(JSON.stringify(await stagingApi(process.argv[2])));
  } catch {
    console.error(
      'Staging Worker release failed; inspect versions and deployment before retrying. No automatic rollback was performed.',
    );
    process.exitCode = 1;
  }
}
