/** Route the synthetic Auth and Sentry origins to loopback stubs and refuse every other origin. */
export function installFetchMap(serialized: string | undefined) {
  const map = JSON.parse(serialized ?? '{}') as Record<string, string>;
  const original = globalThis.fetch;
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (input instanceof Request)
      return Promise.reject(new Error('edge trial refuses Request inputs'));
    const url = new URL(String(input));
    const target = map[url.origin];
    if (!target)
      return Promise.reject(new Error('edge trial forbids outbound HTTP'));
    return original(new URL(url.pathname + url.search, target), init);
  };
}
