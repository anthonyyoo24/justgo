type Operation = 'deploy' | 'migrate-deploy' | 'secrets';
export type LocalReleaseOptions = Readonly<{
  tag: string;
  operation: Operation;
  plan?: string;
  dryRun: boolean;
}>;
type Run = (
  command: string,
  args: string[],
  options?: { cwd?: string },
) => Promise<string>;
type Receipt = Record<string, unknown> & { event: string };
export const stagingWorkflow: 'staging-api.yml';
export const usage: string;
export function localReleaseArguments(args: string[]): LocalReleaseOptions;
export function localCommand(
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<string>;
export function taggedSource(
  tag: string,
  options?: { root?: string; run?: Run },
): Promise<string>;
export function assertOwnerMachine(env?: NodeJS.ProcessEnv): void;
export function receiptsFrom(log: string): Receipt[];
export function dryRun(
  release: { tag: string; operation: Operation; sha: string },
  options?: {
    root?: string;
    log?: (line: string) => void;
    build?: (options: {
      root?: string;
      directory: string;
      sourceSha: string;
    }) => Promise<{ bytes: number; uploadSha256: string }>;
  },
): Promise<void>;
export function dispatchRelease(
  release: { tag: string; operation: Operation; plan?: string },
  options?: {
    run?: Run;
    log?: (line: string) => void;
    wait?: (ms: number) => Promise<unknown>;
    now?: () => number;
    attempts?: number;
  },
): Promise<{ runId: string; url: string; receipts: Receipt[] }>;
export function runLocalStagingRelease(
  args: string[],
  options?: {
    env?: NodeJS.ProcessEnv;
    root?: string;
    run?: Run;
    log?: (line: string) => void;
  },
): Promise<unknown>;
