import { fileURLToPath } from 'node:url';

/** Generate a reviewed target; never guess account or database binding IDs. */
export function workerConfiguration({
  environment,
  hyperdriveId,
  sourceSha,
  accountId,
}) {
  if (
    !['staging', 'production'].includes(environment) ||
    !/^[a-f0-9]{32}$/.test(accountId ?? '') ||
    !/^[a-f0-9]{32}$/.test(hyperdriveId ?? '') ||
    !/^[a-f0-9]{40}$/.test(sourceSha ?? '')
  )
    throw new Error('Invalid Cloudflare release configuration');
  return {
    name: `justgo-api-${environment}`,
    account_id: accountId,
    main: fileURLToPath(new URL('./src/worker.ts', import.meta.url)),
    compatibility_date: '2026-10-28',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: true,
    preview_urls: true,
    placement: { region: 'aws:ca-central-1' },
    // Automatic invocation logs include URLs. Only our rebuilt diagnostics are allowed.
    observability: { enabled: false },
    hyperdrive: [{ binding: 'HYPERDRIVE', id: hyperdriveId }],
    vars: {
      NODE_ENV: 'production',
      APP_ENVIRONMENT: environment,
      JUSTGO_SOURCE_SHA: sourceSha,
      MANAGED_AUTH_ENABLED: 'true',
    },
  };
}
