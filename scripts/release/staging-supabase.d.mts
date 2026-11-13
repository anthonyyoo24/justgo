export type ServingState = {
  sha: string;
  version?: number;
};
export type SupabaseReleaseReceipt = {
  event: 'staging_supabase_release';
  status: 'deployed' | 'unchanged';
  project: string;
  sourceSha: string;
  previousApiSha: string;
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
export const functionSecretNames: readonly string[];
export const functionSecretRules: Readonly<
  Record<string, (value: string, values: Record<string, string>) => boolean>
>;
export function functionSecretFailure(name: string): string;
export function functionSecrets(text: string | undefined): {
  values: Record<string, string>;
  names: string[];
};
export function envFileText(values: Record<string, string>): string;
