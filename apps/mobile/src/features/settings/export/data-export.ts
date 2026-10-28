import type { AccountClient } from '../../../lib/network/account-client';
import type { AccountRepository } from '../../../data/activity/repository';
import {
  createDataBackup,
  type BackupOwner,
} from '../../../data/backup/data-backup';
import { ApiError } from '../../../lib/network/http';

export type ExportArchive = { name: string; bytes: Uint8Array };

/** Download one complete durable collection; authenticated mode first reads all cloud pages. */
export async function collectExport({
  client,
  repository,
  ownerKind,
  reduceMotion,
  haptics,
  signal,
}: {
  client: Pick<AccountClient, 'ownsCollection' | 'ownsAccount'>;
  repository: Pick<
    AccountRepository,
    'accountId' | 'hydrate' | 'store' | 'snapshotData' | 'synchronize'
  >;
  ownerKind: BackupOwner['kind'];
  reduceMotion: boolean;
  haptics: boolean;
  signal: AbortSignal;
}): Promise<ExportArchive> {
  const check = () => {
    if (signal.aborted) throw new ApiError('CANCELLED');
    if (!client.ownsCollection(repository.accountId))
      throw new ApiError('ACCOUNT_CHANGED');
  };
  check();
  await repository.hydrate();
  check();
  if (
    client.ownsAccount(repository.accountId) &&
    repository.store.getState().dataMode === 'cloud'
  ) {
    await repository.synchronize();
    check();
  }
  const snapshot = await repository.snapshotData();
  check();
  return createDataBackup({
    owner: { id: repository.accountId, kind: ownerKind },
    exportedAt: new Date().toISOString(),
    ...snapshot,
    preferences: { reduceMotion, haptics },
  });
}
