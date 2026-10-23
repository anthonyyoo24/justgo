import { getRandomValues, randomUUID } from 'expo-crypto';
import { sessionResponseSchema, type SessionProposal } from '@justgo/contracts';
import type { CredentialVault, DeviceState } from '../storage';
import type { IdentityApi } from '../api';
import { ApiError } from '../../../lib/network/http';

/** The retired UI is never revived: renew only this installation's exact owner proof. */
export async function legacyLinkProof(
  vault: CredentialVault,
  api: IdentityApi,
  owner: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  let state = await vault.read();
  if (state?.session?.info.userId !== owner) return undefined;
  if (state.pending && !['renew', 'recover'].includes(state.pending.kind))
    throw new ApiError('CONFLICT');
  const save = async (next: DeviceState) => {
    await vault.write(next);
    state = next;
  };
  if (!state.pending) {
    try {
      const current = await api.request(
        'GET',
        '/sessions/current',
        sessionResponseSchema,
        undefined,
        state.session.token,
        signal,
      );
      if (
        current.userId !== owner ||
        current.sessionId !== state.session.info.sessionId
      )
        throw new ApiError('ACCOUNT_CHANGED');
      if (Date.parse(current.expiresAt) - Date.now() >= 24 * 60 * 60 * 1000)
        return state.session.token;
      const proposal = makeProposal(state.deviceId);
      await save({ ...state, pending: { kind: 'renew', proposal } });
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'SESSION_EXPIRED')
        throw error;
      if (!state.selectedId) throw new ApiError('UNAUTHORIZED');
      await save({
        ...state,
        pending: {
          kind: 'recover',
          credentialId: state.selectedId,
          proposal: makeProposal(state.deviceId),
        },
      });
    }
  }
  const pending = state.pending;
  if (!pending || (pending.kind !== 'renew' && pending.kind !== 'recover'))
    throw new ApiError('CONFLICT');
  let body: unknown;
  if (pending.kind === 'recover') {
    const credential = (await vault.credentials()).find(
      (value) => value.id === pending.credentialId,
    );
    if (!credential) throw new ApiError('UNAUTHORIZED');
    body = {
      kind: 'recovery',
      credential: credential.secret,
      ...pending.proposal,
    };
  } else body = { kind: 'renewal', ...pending.proposal };
  const response = await api.request(
    'POST',
    '/sessions',
    sessionResponseSchema,
    body,
    pending.kind === 'renew' ? state.session?.token : undefined,
    signal,
  );
  if (
    response.userId !== owner ||
    response.deviceId !== pending.proposal.deviceId ||
    response.sessionId !== pending.proposal.sessionId
  )
    throw new ApiError('ACCOUNT_CHANGED');
  await save({
    ...state,
    session: { token: pending.proposal.sessionToken, info: response },
    pending: null,
  });
  return pending.proposal.sessionToken;
}
function makeProposal(deviceId: string): SessionProposal {
  return {
    deviceId,
    sessionId: randomUUID(),
    sessionToken: Array.from(getRandomValues(new Uint8Array(32)), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join(''),
  };
}
