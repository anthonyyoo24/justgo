export const stagingTarget: Readonly<{
  repository: string;
  environment: string;
  reviewer: string;
}>;
export class StagingRunnerFailure extends Error {
  constructor(code: string);
}
export function stagingRunnerFailureCode(error: unknown): string | undefined;
export function requireRelease(
  condition: unknown,
  code: string,
): asserts condition;
export function isSourceSha(value: unknown): value is string;
export function releaseContext(env?: NodeJS.ProcessEnv): {
  sha: string;
  runId: string;
  attempt: string;
};
export function validateFoundation(value: unknown, sha: unknown): void;
export function validateStagingEnvironment(
  environment: unknown,
  policies: unknown,
  reviewerId: unknown,
): void;
export function productionPath(path: unknown): boolean;
export function validateProbe(
  response: {
    status: number;
    headers: Record<string, string | undefined>;
    body: string;
  },
  kind: 'health' | 'ready' | 'unauthorized',
  sha: string,
): void;
