export type StagingBaseline = { deploymentId: string; sourceSha: string };
export type StagingPromotionPhase =
  | 'promotion-request'
  | 'deployment-readback'
  | 'candidate-provenance'
  | 'public-probes';
export class StagingRunnerFailure extends Error {
  constructor(
    code: string,
    promotion?: { phase: StagingPromotionPhase; cause?: unknown },
  );
}
export function stagingRunnerFailureCode(error: unknown): string | undefined;
export function stagingRunnerPromotionDiagnostic(
  error: unknown,
): { promotionPhase: StagingPromotionPhase; causeCode?: string } | undefined;
export type StagingReceipt = {
  sourceSha: string;
  versionId: string;
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
