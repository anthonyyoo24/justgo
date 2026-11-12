export type ServingState = {
  host: 'function' | 'worker';
  sha: string;
  version?: number;
};
export type SupabaseReleaseReceipt = {
  event: 'staging_supabase_release';
  status: 'deployed' | 'unchanged';
  project: string;
  sourceSha: string;
  previousApiSha: string;
  previousHost: 'function' | 'worker';
  servingVersion: number;
  uploadSha256?: string;
  bytes?: number;
  candidateVersion?: number;
};
export function supabaseLane(options?: {
  env?: NodeJS.ProcessEnv;
  root?: string;
  signal?: AbortSignal;
}): {
  preflight(): Promise<ServingState>;
  deploy(options: {
    beforeServing: () => Promise<void>;
  }): Promise<SupabaseReleaseReceipt>;
};
