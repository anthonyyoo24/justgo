import { identityErrorCodeSchema } from '@justgo/contracts';
import { ApiError } from '../../../lib/network/http';
import {
  connectionReference,
  type ConnectionPhase,
} from './connection-reference';
import { ProviderAuthError } from './types';

const requestId = '12345678-1234-4234-8234-123456789abc';
const secret = 'synthetic-private-token@example.invalid';

function reference(phase: unknown, error: unknown) {
  const result = connectionReference(phase as ConnectionPhase, error);
  expect(result.length).toBeLessThanOrEqual(128);
  expect(result).not.toMatch(/[\r\n]/);
  expect(result).not.toContain(secret);
  return result;
}

it.each<ConnectionPhase>([
  'phone-prepare',
  'provider-auth',
  'legacy-vault',
  'legacy-proof',
  'app-session',
  'save-mapping',
  'adopt-guest',
  'save-account',
  'retire-guest',
])('retains the closed %s stage without reading provider details', (phase) => {
  expect(reference(phase, new ProviderAuthError('AUTH'))).toBe(
    `Dev sign-in reference: ${phase} / AUTH`,
  );
});

it.each(identityErrorCodeSchema.options)(
  'accepts the shared API error code %s',
  (code) => {
    expect(reference('app-session', new ApiError(code, requestId))).toBe(
      `Dev sign-in reference: app-session / ${code} / ${requestId}`,
    );
  },
);

it.each([
  'NETWORK',
  'STORAGE',
  'TIMEOUT',
  'CANCELLED',
  'ACCOUNT_CHANGED',
  'INVALID_RESPONSE',
  'DELETION_UNAVAILABLE',
  'DELETION_REJECTED',
] as const)('accepts the local API error code %s', (code) => {
  expect(reference('adopt-guest', new ApiError(code))).toBe(
    `Dev sign-in reference: adopt-guest / ${code}`,
  );
});

it.each([
  'CANCELLED',
  'CONFIGURATION',
  'AUTH',
  'STORAGE',
  'LAST_PROVIDER',
] as const)(
  'accepts the provider code %s without accepting a provider request ID',
  (code) => {
    const error = new ProviderAuthError(code);
    Object.assign(error, { requestId });
    expect(reference('provider-auth', error)).toBe(
      `Dev sign-in reference: provider-auth / ${code}`,
    );
  },
);

it('normalizes a valid uppercase UUID without exposing other error fields', () => {
  const error = new ApiError('UNAVAILABLE', requestId.toUpperCase());
  const read = jest.fn(() => {
    throw new Error(secret);
  });
  for (const key of [
    'message',
    'cause',
    'status',
    'headers',
    'token',
    'email',
    'userId',
    'ownerId',
  ])
    Object.defineProperty(error, key, { get: read });
  expect(reference('app-session', error)).toBe(
    `Dev sign-in reference: app-session / UNAVAILABLE / ${requestId}`,
  );
  expect(read).not.toHaveBeenCalled();
});

it.each([
  secret,
  `${requestId}\n${secret}`,
  ` ${requestId}`,
  `${requestId} `,
  `request=${requestId}`,
  JSON.stringify({ requestId, token: secret }),
  '12345678-1234-4234-1234-123456789abc',
  '12345678-1234-0234-8234-123456789abc',
  requestId.repeat(10),
  '',
])(
  'omits an untrusted request ID rather than displaying it: %#',
  (untrusted) => {
    expect(
      reference('app-session', new ApiError('UNAVAILABLE', untrusted)),
    ).toBe('Dev sign-in reference: app-session / UNAVAILABLE');
  },
);

it('rejects native objects and plain error-shaped values without reading their properties', () => {
  const read = jest.fn(() => {
    throw new Error(secret);
  });
  const native = Object.defineProperties(
    {},
    {
      code: { get: read },
      requestId: { get: read },
      message: { get: read },
    },
  );
  for (const error of [
    native,
    { code: 'AUTH', requestId },
    new Error(secret),
    null,
    undefined,
    secret,
  ])
    expect(reference('provider-auth', error)).toBe(
      'Dev sign-in reference: provider-auth / UNKNOWN',
    );
  expect(read).not.toHaveBeenCalled();
});

it('rejects mutated codes and does not coerce a code object', () => {
  const coerce = jest.fn(() => {
    throw new Error(secret);
  });
  for (const error of [
    new ApiError('NETWORK'),
    new ProviderAuthError('AUTH'),
  ]) {
    for (const code of [
      secret,
      `AUTH\n${secret}`,
      { toString: coerce },
      undefined,
    ]) {
      Object.defineProperty(error, 'code', { value: code, configurable: true });
      expect(reference('provider-auth', error)).toBe(
        'Dev sign-in reference: provider-auth / UNKNOWN',
      );
    }
  }
  expect(coerce).not.toHaveBeenCalled();
});

it('does not invoke accessors masquerading as a trusted error code or request ID', () => {
  const read = jest.fn(() => {
    throw new Error(secret);
  });
  const codeError = new ApiError('NETWORK');
  Object.defineProperty(codeError, 'code', { get: read });
  expect(reference('app-session', codeError)).toBe(
    'Dev sign-in reference: app-session / UNKNOWN',
  );
  const idError = new ApiError('NETWORK');
  Object.defineProperty(idError, 'requestId', { get: read });
  expect(reference('app-session', idError)).toBe(
    'Dev sign-in reference: app-session / NETWORK',
  );
  expect(read).not.toHaveBeenCalled();
});

it('keeps API and provider error vocabularies distinct at runtime', () => {
  const api = new ApiError('NETWORK', requestId);
  Object.defineProperty(api, 'code', { value: 'AUTH' });
  const provider = new ProviderAuthError('AUTH');
  Object.defineProperty(provider, 'code', { value: 'NETWORK' });
  for (const error of [api, provider])
    expect(reference('provider-auth', error)).toBe(
      'Dev sign-in reference: provider-auth / UNKNOWN',
    );
});

it('does not coerce an object masquerading as a request ID', () => {
  const coerce = jest.fn(() => {
    throw new Error(secret);
  });
  const error = new ApiError('UNAVAILABLE');
  Object.defineProperty(error, 'requestId', { value: { toString: coerce } });
  expect(reference('app-session', error)).toBe(
    'Dev sign-in reference: app-session / UNAVAILABLE',
  );
  expect(coerce).not.toHaveBeenCalled();
});

it('falls back for invalid phases without coercion or interpolation', () => {
  const coerce = jest.fn(() => {
    throw new Error(secret);
  });
  for (const phase of [
    secret,
    `app-session\n${secret}`,
    undefined,
    { toString: coerce },
  ])
    expect(reference(phase, new ProviderAuthError('AUTH'))).toBe(
      'Dev sign-in reference: unknown / AUTH',
    );
  expect(coerce).not.toHaveBeenCalled();
});

it('contains a hostile prototype trap without reading or displaying its thrown error', () => {
  const error = new Proxy(
    {},
    {
      getPrototypeOf: () => {
        throw new Error(secret);
      },
    },
  );
  expect(reference('legacy-vault', error)).toBe(
    'Dev sign-in reference: legacy-vault / UNKNOWN',
  );
});
