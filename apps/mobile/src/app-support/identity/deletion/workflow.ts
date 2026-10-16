import type { AccountDeletionResponse } from '@justgo/contracts';
import { IdentityClientError } from '../api';
import type { DeviceState } from '../storage';

type DeletionWorkflow = {
  read: () => DeviceState;
  save: (state: DeviceState) => Promise<void>;
  publish: (status: 'pending' | 'cleanup' | 'deleted' | null) => void;
  request: (token: string) => Promise<AccountDeletionResponse>;
  clearData: (userId: string) => Promise<void>;
  clearCredentials: (digests: string[]) => Promise<void>;
};

// The identity controller supplies its existing serialized/deadline-bound I/O.
// This workflow owns the durable transition from request to receipt to cleanup.
export async function resumeAccountDeletion(context: DeletionWorkflow) {
  let pending = context.read().pending;
  if (pending?.kind !== 'delete') throw new IdentityClientError('CONFLICT');
  context.publish(pending.receipt ? 'cleanup' : 'pending');
  if (!pending.receipt) {
    const token = context.read().session?.token;
    if (!token) throw new IdentityClientError('STORAGE');
    let receipt;
    try {
      receipt = await context.request(token);
    } catch (error) {
      if (
        error instanceof IdentityClientError &&
        [
          'UNAUTHORIZED',
          'SESSION_EXPIRED',
          'SESSION_REVOKED',
          'CREDENTIAL_REJECTED',
          'NOT_FOUND',
          'INVALID_REQUEST',
        ].includes(error.code)
      ) {
        // A definitive rejection means this proof did not accept a deletion.
        await context.save({ ...context.read(), pending: null });
        if (error.code === 'NOT_FOUND')
          throw new IdentityClientError(
            'DELETION_UNAVAILABLE',
            error.requestId,
          );
        if (error.code === 'INVALID_REQUEST')
          throw new IdentityClientError('DELETION_REJECTED', error.requestId);
        context.publish(null);
      }
      throw error;
    }
    if (receipt.userId !== pending.userId)
      throw new IdentityClientError('UNAVAILABLE');
    pending = { ...pending, receipt };
    await context.save({ ...context.read(), pending });
    context.publish('cleanup');
  }
  await context.clearData(pending.userId);
  await context.clearCredentials(pending.receipt!.credentialDigests);
  await context.save({
    ...context.read(),
    selectedId: null,
    session: null,
    pending: null,
    savedKey: null,
    registration: null,
    accountDeleted: true,
  });
  context.publish('deleted');
}
