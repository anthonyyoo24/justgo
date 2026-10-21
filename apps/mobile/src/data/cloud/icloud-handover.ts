import { z } from 'zod';
import type { JournalStorage } from '../activity/model';
import type { AccountRepository } from '../activity/repository';
import { ICloudError, type ICloudSync } from '../../platform/icloud/model';

type Snapshot = Awaited<ReturnType<AccountRepository['snapshotData']>>;
type Remote = { generation: string; revision: string | null };
const handoverSchema = z
  .object({
    version: z.literal(1),
    targetOwnerId: z.uuid(),
    accountToken: z.string().regex(/^[a-f\d]{64}$/),
    stage: z.enum(['copying', 'resetting', 'purging', 'complete']),
    sourceGeneration: z.uuid().nullable(),
    purgeGeneration: z.uuid().nullable(),
    purgeCursor: z.string().min(1).max(32_768).nullable(),
    accepted: z
      .array(z.string().regex(/^[a-f\d]{64}$/))
      .max(50_000)
      .nullable()
      .default(null),
  })
  .strict();

/** The target callback must durably accept the complete snapshot before resolving. */
export async function handoverGuestCopy(input: {
  targetOwnerId: string;
  sourceId: string;
  storage: JournalStorage;
  cloud: ICloudSync;
  read(): Promise<Remote>;
  download(consume: (remote: Remote) => Promise<void>): Promise<void>;
  snapshot(): Promise<Snapshot>;
  identity(snapshot: Snapshot): Promise<string[]>;
  importVerified(snapshot: Snapshot): Promise<void>;
}) {
  const status = await input.cloud.status();
  if (!status.enabled || !status.accountToken)
    throw new ICloudError('DISABLED');
  const key = `justgo:v1:${input.sourceId}:icloud-handover:${status.accountToken}`;
  const raw = await input.storage.getItem(key);
  let state = raw
    ? handoverSchema.parse(JSON.parse(raw))
    : handoverSchema.parse({
        version: 1,
        targetOwnerId: input.targetOwnerId,
        accountToken: status.accountToken,
        stage: 'copying',
        sourceGeneration: null,
        purgeGeneration: null,
        purgeCursor: null,
      });
  if (
    state.targetOwnerId !== input.targetOwnerId ||
    state.accountToken !== status.accountToken
  )
    throw new ICloudError('ACCOUNT_CHANGED');
  const save = () =>
    input.storage.setItem(key, JSON.stringify(handoverSchema.parse(state)));
  const copyCurrent = async () => {
    const snapshot = await input.snapshot();
    const identity = await input.identity(snapshot);
    if (JSON.stringify(identity) === JSON.stringify(state.accepted)) return;
    await input.importVerified(snapshot);
    state = { ...state, accepted: identity };
    await save();
  };
  // A failed cleanup leaves local writing usable. Preserve edits made while the
  // already copied source waits for its durable controller transition.
  if (state.stage === 'complete') {
    await copyCurrent();
    if (!state.purgeGeneration) throw new ICloudError('INVALID_DATA');
    return state.purgeGeneration;
  }
  // Record the destination before any target acceptance or destructive source work.
  await input.storage.setItem(
    `justgo:v1:${input.sourceId}:icloud-handover`,
    JSON.stringify({ targetOwnerId: input.targetOwnerId }),
  );
  await save();
  const current = await input.read();
  if (
    state.stage === 'resetting' &&
    current.generation !== state.sourceGeneration
  ) {
    // The original reset was accepted, or another device reset the same source.
    // Never replay adoption or reset a newer generation after a lost response.
    state = {
      ...state,
      stage: 'purging',
      purgeGeneration: current.generation,
      purgeCursor: null,
    };
    await save();
  }
  if (state.stage === 'copying' || state.stage === 'resetting') {
    let copied = false;
    await input.download(async (remote) => {
      if (!remote.revision) throw new ICloudError('NOT_CONFIGURED');
      await copyCurrent();
      state = {
        ...state,
        stage: 'resetting',
        sourceGeneration: remote.generation,
      };
      await save();
      // The root revision changes atomically with every write. A racing phone's
      // writing therefore forces another read/copy instead of being discarded.
      const reset = await input.cloud.reset({
        collection: 'guest',
        generation: remote.generation,
        expectedRevision: remote.revision,
      });
      state = {
        ...state,
        stage: 'purging',
        purgeGeneration: reset.generation,
        purgeCursor: null,
      };
      await save();
      copied = true;
    });
    if (!copied) throw new ICloudError('UNAVAILABLE');
  }
  await copyCurrent();
  const generation = state.purgeGeneration;
  if (!generation) throw new ICloudError('INVALID_DATA');
  const cursors = new Set<string>();
  while (true) {
    const page = await input.cloud.purge({
      collection: 'guest',
      generation,
      ...(state.purgeCursor ? { cursor: state.purgeCursor } : {}),
    });
    if (page.generation !== generation || cursors.has(page.cursor))
      throw new ICloudError('INVALID_DATA');
    cursors.add(page.cursor);
    state = {
      ...state,
      purgeCursor: page.cursor,
      stage: page.hasMore ? 'purging' : 'complete',
    };
    await save();
    if (!page.hasMore) return generation;
    if (cursors.size > 2_010) throw new ICloudError('INVALID_DATA');
  }
}
