import { identityErrorCodeSchema } from '@justgo/contracts';
import { ApiError, localClientErrorCodes } from '../../../lib/network/http';
import { ProviderAuthError, providerAuthErrorCodes } from './types';

const connectionPhases = [
  'phone-prepare',
  'provider-auth',
  'legacy-vault',
  'legacy-proof',
  'app-session',
  'save-mapping',
  'adopt-guest',
  'save-account',
  'retire-guest',
] as const;
export type ConnectionPhase = (typeof connectionPhases)[number];
const phases = new Set<string>(connectionPhases);

const apiCodes = new Set<string>([
  ...identityErrorCodeSchema.options,
  ...localClientErrorCodes,
]);
const providerCodes = new Set<string>(providerAuthErrorCodes);
const requestIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

/** A local Dev reference contains only closed vocabulary and a canonical request ID. */
export function connectionReference(
  phase: ConnectionPhase,
  error: unknown,
): string {
  const safePhase =
    typeof phase === 'string' && phases.has(phase) ? phase : 'unknown';
  let code = 'UNKNOWN';
  let requestId: string | undefined;
  try {
    const api = error instanceof ApiError;
    if (api || error instanceof ProviderAuthError) {
      // Data descriptors avoid invoking getters on malformed/native error objects.
      const candidate: unknown = Object.getOwnPropertyDescriptor(
        error,
        'code',
      )?.value;
      if (
        typeof candidate === 'string' &&
        (api ? apiCodes : providerCodes).has(candidate)
      ) {
        code = candidate;
        if (api) {
          const reference: unknown = Object.getOwnPropertyDescriptor(
            error,
            'requestId',
          )?.value;
          if (typeof reference === 'string' && requestIdPattern.test(reference))
            requestId = reference.toLowerCase();
        }
      }
    }
  } catch {
    // Even a hostile proxy must not expose its error text or break sign-in feedback.
    code = 'UNKNOWN';
    requestId = undefined;
  }
  return `Dev sign-in reference: ${safePhase} / ${code}${requestId ? ` / ${requestId}` : ''}`;
}
