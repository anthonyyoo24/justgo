import { checkConnection } from './connection';

const fetchMock = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = fetchMock;
  fetchMock.mockReset();
});
afterAll(() => {
  global.fetch = originalFetch;
});

it('does not request anything without a configured API', async () => {
  expect(await checkConnection(undefined)).toBe('unconfigured');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('requires both a valid health response and database readiness', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ status: 'ok', service: 'justgo-api' }),
  });
  fetchMock.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ status: 'unavailable' }),
  });
  expect(await checkConnection('https://api.example')).toBe(
    'database-unavailable',
  );
});
it('handles transport errors without exposing their details', async () => {
  fetchMock.mockRejectedValueOnce(new Error('sensitive internal detail'));
  expect(await checkConnection('https://api.example')).toBe('unavailable');
});
