import { requireRelease, StagingRunnerFailure } from './staging-api.mjs';

/** No retries or redirects. Provider text never enters diagnostics. */
export async function cloudflareRequest(
  target,
  path,
  {
    token,
    method = 'GET',
    body,
    signal,
    allowMissing = false,
    fetch: send = globalThis.fetch,
  } = {},
) {
  const create = path === '?excludeScript=true&bindings_inherit=strict';
  const code = create
    ? 'STAGING_BOOTSTRAP_UNCONFIRMED'
    : method === 'POST'
      ? 'STAGING_VERSION_UPLOAD_UNCONFIRMED'
      : 'STAGING_PROVIDER_REQUEST_FAILED';
  requireRelease(!signal?.aborted, 'STAGING_DATABASE_LEASE_LOST');
  requireRelease(
    /^\/(?:deployments|versions|subdomain|settings)(?:\/[a-f0-9-]{36})?(?:\?bindings_inherit=strict)?$/.test(
      path,
    ) ||
      path === '/workers/subdomain' ||
      path === `/hyperdrive/configs/${target.hyperdriveId}` ||
      (create && method === 'PUT'),
    code,
  );
  requireRelease(
    !allowMissing || (method === 'GET' && path === '/settings'),
    code,
  );
  const resource =
    path.startsWith('/hyperdrive/') || path === '/workers/subdomain'
      ? path
      : `/workers/scripts/${target.worker}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await send(
      `https://api.cloudflare.com/client/v4/accounts/${target.accountId}${resource}`,
      {
        method,
        redirect: 'error',
        headers: {
          authorization: `Bearer ${token}`,
          ...(create ? { 'if-none-match': '*' } : {}),
          ...(method === 'POST' && path === '/subdomain'
            ? {
                'content-type': 'application/json',
                'Cloudflare-Workers-Script-Api-Date': '2025-08-01',
              }
            : {}),
        },
        ...(body ? { body } : {}),
        signal: signal
          ? AbortSignal.any([signal, controller.signal])
          : controller.signal,
      },
    );
    const reader = response.body?.getReader();
    requireRelease(reader, code);
    let length = 0;
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      requireRelease(length <= 1024 * 1024, code);
      chunks.push(value);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    // Only the provider's exact missing-Worker response establishes absence.
    // An authorization failure, generic 404 or unknown response is never absence.
    if (
      allowMissing &&
      response.status === 404 &&
      result.success === false &&
      result.errors?.length === 1 &&
      result.errors[0].code === 10007
    )
      return null;
    requireRelease(response.ok, code);
    requireRelease(result.success === true && result.result, code);
    return result.result;
  } catch {
    throw new StagingRunnerFailure(code);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

/** Probes carry no user credentials and never follow a redirect to an old host. */
export async function workerProbe(
  origin,
  path,
  { signal, fetch: send = globalThis.fetch } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await send(new URL(path, origin), {
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal,
    });
    const reader = response.body?.getReader();
    requireRelease(reader, 'INVALID_STAGING_PROBE');
    let length = 0;
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      requireRelease(length <= 4096, 'INVALID_STAGING_PROBE');
      chunks.push(value);
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.concat(chunks).toString('utf8'),
    };
  } catch {
    throw new StagingRunnerFailure('INVALID_STAGING_PROBE');
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
