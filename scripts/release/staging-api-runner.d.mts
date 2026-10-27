export type StagingBaseline = { deploymentId: string; sourceSha: string };
export type StagingReceipt = {
  sourceSha: string;
  deploymentId: string;
  previousDeploymentId: string;
  uploadSha256: string;
  runId: string;
  runAttempt: string;
};
type Options = {
  env?: NodeJS.ProcessEnv;
  root?: string;
  signal?: AbortSignal;
  beforePromote?: () => Promise<void>;
};
export function stagingApi(
  operation: 'preflight',
  options?: Options,
): Promise<StagingBaseline>;
export function stagingApi(
  operation: 'deploy',
  options: Options & { beforePromote: () => Promise<void> },
): Promise<StagingReceipt>;
