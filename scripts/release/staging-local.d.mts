import type { StagingBaseline, StagingReceipt } from './staging-api-runner.mjs';

export const localStagingBranch: 'codex/phase-15-rollout';
export type LocalContext = Readonly<{
  sha: string;
  runId: string;
  attempt: '1';
}>;
export type LocalConfiguration = Record<
  | 'CLOUDFLARE_API_TOKEN'
  | 'CLOUDFLARE_ACCOUNT_ID'
  | 'CLOUDFLARE_WORKERS_SUBDOMAIN'
  | 'STAGING_HYPERDRIVE_ID'
  | 'MIGRATION_DATABASE_URL'
  | 'DATABASE_CA_CERT',
  string
>;
type Options = {
  env?: NodeJS.ProcessEnv;
  root?: string;
  signal?: AbortSignal | undefined;
};
type ReleaseOptions = Options & { context: LocalContext };
export function localReleaseArguments(args: string[]): {
  deploy: boolean;
  sha: string;
  credentials: string;
};
export function assertLocalSource(
  sha: string,
  options?: Options,
): Promise<void>;
export function localStagingContext(
  sha: string,
  options?: Options,
): Promise<LocalContext>;
export function localReleaseConfiguration(path: string): LocalConfiguration;
export function localBuildEnvironment(
  configuration: LocalConfiguration,
  env?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;
export function localPublicationEnvironment(
  root: string,
  env?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;
export function runLocalPublicationChecks(root: string): Promise<string[]>;
export function localStagingApi(
  operation: 'preflight',
  options: ReleaseOptions,
): Promise<StagingBaseline>;
export function localStagingApi(
  operation: 'deploy',
  options: ReleaseOptions & { beforePromote: () => Promise<void> },
): Promise<StagingReceipt>;
export function prepareLocalBundle(
  context: LocalContext,
  env: NodeJS.ProcessEnv,
  root?: string,
  options?: { signal?: AbortSignal | undefined },
): Promise<{ uploadSha256: string; bytes: number }>;
