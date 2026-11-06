import {
  completionAttemptSchema,
  type CompletionAttempt,
  type CompletionRestoreRequest,
  type JournalSyncRequest,
  type JournalSyncVersion,
} from '@justgo/contracts';
import { ApiError } from '../../lib/network/http';
import type { JournalStorage } from '../activity/model';
import { AccountRepository } from '../activity/repository';
import type { JournalBackend } from '../journal/backend';
import { journalEntryIdentity, type LocalJournalEntry } from '../journal/model';
import { LocalJournalRepository } from '../journal/repository';
import { CloudDataCoordinator } from './coordinator';
import type { DataSyncTransport } from './transport';
import {
  MemoryStorage,
  attempt,
  backend,
  card,
  deferred,
  input,
  owner,
  today,
  uuid,
  zone,
} from '../../../test-support/journal';
import { memoryJournalBackend } from '../../../test-support/local-journal';

// .claude/skills/verify-delete-all-retry/SKILL.md owns the property, bounds and scope.
const bounds = { faults: 2, others: 2 };
const intent = uuid(900);
const prefix = `justgo:v1:${owner}:`;
const metadataKey = `${prefix}cloud-sync`;
const pendingKey = `${prefix}delete-all-pending`;

type Step = 'proceed' | 'otherWrite' | 'otherDelete' | 'crash' | 'lostAck';
const isFault = (step: Step) => step === 'crash' || step === 'lostAck';
type Choice = { at: string; kind: string; options: Step[]; picked: number };

/** Replays recorded choices, then takes the first option at each new choice point. */
class Schedule {
  readonly choices: Choice[] = [];
  readonly story: string[] = [];
  private faults = 0;
  private others = 0;
  constructor(private readonly replay: readonly Choice[] = []) {}
  get events() {
    return this.faults + this.others;
  }
  choose(at: string, kind: string, offered: readonly Step[]): Step {
    const options = offered.filter(
      (step) =>
        step === 'proceed' ||
        (isFault(step)
          ? this.faults < bounds.faults
          : this.others < bounds.others),
    );
    const recorded = this.replay[this.choices.length];
    if (recorded && recorded.at !== at)
      throw new Error(
        `Replay diverged at choice ${this.choices.length + 1}: recorded ${recorded.at}, reached ${at}`,
      );
    const picked = recorded?.picked ?? 0;
    const step = options[picked] ?? 'proceed';
    this.choices.push({ at, kind, options, picked });
    if (isFault(step)) this.faults++;
    else if (step !== 'proceed') this.others++;
    return step;
  }
  next(): Schedule | null {
    for (let index = this.choices.length - 1; index >= 0; index--) {
      const choice = this.choices[index]!;
      if (choice.picked + 1 < choice.options.length)
        return new Schedule([
          ...this.choices.slice(0, index),
          { ...choice, picked: choice.picked + 1 },
        ]);
    }
    return null;
  }
}

type Device = 'phone' | 'other';
type Stored = { attempt: CompletionAttempt; epoch: number; by: Device };
const deletedAt = '2026-10-20T10:00:00.000Z';

/** Models one user row behind deletion.ts, and the requireDataEpoch fence of completions.ts and journal.ts. */
class Server {
  epoch = 0;
  deletedAt: string | null = null;
  completions: Stored[];
  versions: JournalSyncVersion[];
  readonly resets: { by: Device; expected: number; deleted: Stored[] }[] = [];
  private readonly tombstones = new Set<string>();
  private otherWrites = 0;
  constructor(completions: Stored[] = [], versions: JournalSyncVersion[] = []) {
    this.completions = [...completions];
    this.versions = [...versions];
  }
  private requireDataEpoch(expected: number) {
    if (expected !== this.epoch) throw new ApiError('DATA_EPOCH_CHANGED');
  }
  deleteData(expected: number, by: Device) {
    // deletion.ts: data_epoch === expectedEpoch + 1 && data_deleted_at returns the earlier result.
    if (this.epoch === expected + 1 && this.deletedAt)
      return { dataEpoch: this.epoch, deletedAt: this.deletedAt };
    this.requireDataEpoch(expected);
    // deletion.ts: insert into deleted_completion_ids, then delete journal_versions and attempts.
    for (const stored of this.completions)
      this.tombstones.add(stored.attempt.id);
    for (const version of this.versions) this.tombstones.add(version.attemptId);
    this.resets.push({ by, expected, deleted: this.completions });
    this.completions = [];
    this.versions = [];
    // deletion.ts: data_epoch=data_epoch+1, data_deleted_at=now().
    this.epoch++;
    this.deletedAt = deletedAt;
    return { dataEpoch: this.epoch, deletedAt };
  }
  putCompletions(request: CompletionRestoreRequest, by: Device) {
    this.requireDataEpoch(request.expectedEpoch);
    let added = 0;
    for (const record of request.attempts) {
      if (this.completions.some((old) => old.attempt.id === record.id))
        continue;
      if (!request.restoreDeleted && this.tombstones.has(record.id))
        throw new ApiError('DATA_DELETED');
      this.completions.push({ attempt: record, epoch: this.epoch, by });
      added++;
    }
    return {
      dataEpoch: this.epoch,
      attempts: request.attempts,
      added,
      identical: request.attempts.length - added,
    };
  }
  putVersions(request: JournalSyncRequest) {
    this.requireDataEpoch(request.expectedEpoch);
    let saved = 0;
    for (const version of request.versions)
      if (!this.versions.some((old) => old.versionId === version.versionId)) {
        this.versions.push(version);
        saved++;
      }
    return {
      dataEpoch: this.epoch,
      versions: request.versions,
      saved,
      identical: request.versions.length - saved,
    };
  }
  otherDeviceWrite() {
    const record = completionAttemptSchema
      .strip()
      .parse(attempt(500 + ++this.otherWrites));
    this.putCompletions(
      { expectedEpoch: this.epoch, attempts: [record] },
      'other',
    );
    return record.id;
  }
}

/** A crash keeps the phone's storage, its local journal and the server. */
type World = {
  storage: MemoryStorage;
  server: Server;
  schedule: Schedule | null;
  captured: number | null;
};
const json = (raw: string | null | undefined): Record<string, unknown> =>
  raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
const shown = (value: unknown) =>
  value === intent ? 'intent' : JSON.stringify(value);

function describeWrite(old: string | undefined, key: string, value: string) {
  const name = key.slice(prefix.length);
  if (name === 'journal')
    return `setItem journal with ${Object.keys(json(value).records as object).length} completions`;
  if (name !== 'cloud-sync') return `setItem ${name} ${value}`;
  const before = json(old);
  const after = json(value);
  const changed = [
    'deleting',
    'deletionId',
    'deletionEpoch',
    'epoch',
    'clearing',
    'completedDeletionId',
  ]
    .filter((field) => before[field] !== after[field])
    .map((field) => `${field}=${shown(after[field])}`);
  return `save cloud-sync ${changed.join(' ') || '(sync state)'}`;
}

/** One app process over the world. A crash freezes it for good. */
function open(world: World) {
  let dead = false;
  const crashed = deferred<void>();
  const frozen = () => new Promise<never>(() => {});
  const crash = () => {
    dead = true;
    crashed.resolve();
    return frozen();
  };
  const durable = async (at: string, kind: string, changes: boolean) => {
    if (dead) return frozen();
    const schedule = world.schedule;
    if (!schedule || !changes) return;
    if (schedule.choose(at, kind, ['proceed', 'crash']) === 'crash') {
      schedule.story.push(`${at}: the app crashes before the write lands`);
      return crash();
    }
    schedule.story.push(at);
  };
  const shared = world.storage;
  const storage: JournalStorage = {
    getAllKeys: async () => (dead ? frozen() : shared.getAllKeys()),
    getItem: async (key) => (dead ? frozen() : shared.getItem(key)),
    setItem: async (key, value) => {
      const old = shared.values.get(key);
      await durable(
        describeWrite(old, key, value),
        key.slice(prefix.length),
        old !== value,
      );
      await shared.setItem(key, value);
      const metadata = json(key === metadataKey ? value : null);
      if (
        world.captured === null &&
        metadata.deletionId === intent &&
        typeof metadata.deletionEpoch === 'number'
      )
        world.captured = metadata.deletionEpoch;
    },
    removeItem: async (key) => {
      await durable(
        `removeItem ${key.slice(prefix.length)}`,
        key.slice(prefix.length),
        shared.values.has(key),
      );
      await shared.removeItem(key);
    },
  };
  const localJournal = memoryJournalBackend(shared);
  const journal: JournalBackend = {
    transaction: async (accountId, action) =>
      dead ? frozen() : localJournal.transaction(accountId, action),
    deleteOwned: async (accountId) => {
      if (dead) return frozen();
      const held = await localJournal.transaction(accountId, async (tx) => [
        ...(await tx.list()),
        ...(await tx.listConflicts()),
      ]);
      await durable(
        'deleteOwned local journal',
        'local journal',
        !!held.length,
      );
      await localJournal.deleteOwned(accountId);
    },
  };
  const call = async <T>(
    at: string,
    offered: readonly Step[],
    apply: () => { value: T; said: string },
  ): Promise<T> => {
    if (dead) return frozen();
    const schedule = world.schedule;
    if (!schedule) return structuredClone(apply().value);
    const kind = at.slice(0, at.indexOf('('));
    for (;;) {
      const step = schedule.choose(at, kind, offered);
      if (step === 'otherWrite') {
        const epoch = world.server.epoch;
        const id = world.server.otherDeviceWrite();
        schedule.story.push(
          `another device writes completion ${id.slice(-3)} at epoch ${epoch}`,
        );
        continue;
      }
      if (step === 'otherDelete') {
        const epoch = world.server.epoch;
        world.server.deleteData(epoch, 'other');
        schedule.story.push(
          `another device deletes all data at epoch ${epoch}, so the server epoch is ${world.server.epoch}`,
        );
        continue;
      }
      if (step === 'crash') {
        schedule.story.push(
          `${at}: the app crashes before the request reaches the server`,
        );
        return crash();
      }
      let result: { value: T; said: string };
      try {
        result = apply();
      } catch (error) {
        schedule.story.push(
          `${at} -> ${error instanceof ApiError ? error.code : String(error)}`,
        );
        throw error;
      }
      if (step === 'lostAck') {
        schedule.story.push(
          `${at} -> ${result.said}, but the response is lost (NETWORK)`,
        );
        throw new ApiError('NETWORK');
      }
      schedule.story.push(`${at} -> ${result.said}`);
      return structuredClone(result.value);
    }
  };
  // A read changes no durable state, so a crash or failure there reaches the
  // same state as one at the next write.
  const reads: Step[] = ['proceed', 'otherWrite', 'otherDelete'];
  const writes: Step[] = [...reads, 'crash', 'lostAck'];
  const server = world.server;
  const transport: DataSyncTransport = {
    completions: (cursor) =>
      call(`completions(${cursor})`, reads, () => ({
        value: {
          dataEpoch: server.epoch,
          attempts: server.completions.map((stored) => stored.attempt),
          nextCursor: null,
        },
        said: `dataEpoch ${server.epoch}`,
      })),
    versions: (cursor) =>
      call(`versions(${cursor})`, reads, () => ({
        value: {
          dataEpoch: server.epoch,
          versions: server.versions,
          nextCursor: null,
        },
        said: `dataEpoch ${server.epoch}`,
      })),
    putCompletions: (request) =>
      call(`putCompletions(${request.expectedEpoch})`, writes, () => ({
        value: server.putCompletions(request, 'phone'),
        said: 'stored',
      })),
    putVersions: (request) =>
      call(`putVersions(${request.expectedEpoch})`, writes, () => ({
        value: server.putVersions(request),
        said: 'stored',
      })),
    deleteData: (expected) =>
      call(`deleteData(${expected})`, writes, () => {
        const before = server.epoch;
        const value = server.deleteData(expected, 'phone');
        return {
          value,
          said:
            before === server.epoch
              ? `server returns the earlier deletion at epoch ${before}`
              : `server resets epoch ${before} to ${server.epoch}`,
        };
      }),
  };
  const repository = new AccountRepository({
    accountId: owner,
    storage,
    transport: backend(),
    today,
    timeZone: zone,
    localJournal: new LocalJournalRepository(owner, journal),
    dataMode: 'cloud',
  });
  let serial = 100;
  const fingerprints = new Map<string, string>();
  const coordinator = new CloudDataCoordinator(repository, storage, transport, {
    id: () => uuid(serial++),
    fingerprint: (entry) => {
      const key = journalEntryIdentity(entry);
      if (!fingerprints.has(key))
        fingerprints.set(key, String(fingerprints.size + 1).padStart(64, '0'));
      return Promise.resolve(fingerprints.get(key)!);
    },
  });
  return { repository, coordinator, storage, crashed: crashed.promise };
}
type App = ReturnType<typeof open>;

type Seed = {
  values: Map<string, string>;
  entries: LocalJournalEntry[];
  conflicts: LocalJournalEntry[];
  completions: Stored[];
  versions: JournalSyncVersion[];
};
async function synchronizedPhone(): Promise<Seed> {
  const world: World = {
    storage: new MemoryStorage(),
    server: new Server(),
    schedule: null,
    captured: null,
  };
  const app = open(world);
  await app.repository.complete(input(1), card);
  await app.repository.submitReflection(uuid(1), uuid(2), {
    text: 'Written before delete-all',
  });
  await app.coordinator.synchronize();
  // ActivityRuntime.deleteAllData persists the intent before calling deleteData.
  await app.storage.setItem(pendingKey, intent);
  app.repository.dispose();
  const journal = await memoryJournalBackend(world.storage).transaction(
    owner,
    async (tx) => ({
      entries: await tx.list(),
      conflicts: await tx.listConflicts(),
    }),
  );
  return {
    values: new Map(world.storage.values),
    ...journal,
    completions: world.server.completions,
    versions: world.server.versions,
  };
}
async function restore(seed: Seed, schedule: Schedule): Promise<World> {
  const storage = new MemoryStorage();
  for (const [key, value] of seed.values) storage.values.set(key, value);
  await memoryJournalBackend(storage).transaction(owner, async (tx) => {
    for (const entry of seed.entries) await tx.put(entry);
    for (const entry of seed.conflicts) await tx.putConflict(entry);
  });
  return {
    storage,
    server: new Server(seed.completions, seed.versions),
    schedule,
    captured: null,
  };
}

const settle = (app: App, work: Promise<void>) =>
  Promise.race([
    work.then(
      () => 'done' as const,
      (error: unknown) => (error instanceof ApiError ? error.code : 'ERROR'),
    ),
    app.crashed.then(() => 'crashed' as const),
    new Promise<'stalled'>((resolve) => setImmediate(resolve, 'stalled')),
  ]);

type Counterexample = {
  invariant: 1 | 2 | 3;
  said: string;
  events: number;
  story: readonly string[];
};

async function explore(seed: Seed, schedule: Schedule) {
  const world = await restore(seed, schedule);
  const found: Omit<Counterexample, 'events' | 'story'>[] = [];
  let app = open(world);
  for (;;) {
    const events = schedule.events;
    const outcome = await settle(app, app.coordinator.deleteData(intent));
    if (outcome === 'stalled') {
      found.push({ invariant: 3, said: 'deleteData(intent) never settled' });
      break;
    }
    if (outcome !== 'done' && outcome !== 'crashed') {
      if (schedule.events === events) {
        found.push({
          invariant: 3,
          said: `a retry with no crash or interference failed with ${outcome}`,
        });
        break;
      }
      schedule.story.push(
        `deleteData(intent) fails with ${outcome}; the runtime retries it`,
      );
      continue;
    }
    if (
      outcome === 'done' &&
      (await settle(app, app.storage.removeItem(pendingKey))) !== 'crashed'
    )
      break;
    schedule.story.push('the app restarts and retries deleteData(intent)');
    app = open(world);
  }
  world.schedule = null;
  const { server, captured } = world;
  const phone = server.resets.filter((reset) => reset.by === 'phone');
  if (phone.length > 1 || phone.some((reset) => reset.expected !== captured))
    found.push({
      invariant: 1,
      said: `this device reset the server from epochs [${phone.map((reset) => reset.expected).join(', ')}] but the intent captured epoch ${captured}`,
    });
  const first = phone[0]?.expected ?? Infinity;
  const lost = phone
    .flatMap((reset) => reset.deleted)
    .filter((stored) => stored.by === 'other' && stored.epoch > first);
  if (lost.length)
    found.push({
      invariant: 2,
      said: `this device deleted completions another device wrote after its reset: ${lost.map((stored) => `${stored.attempt.id.slice(-3)} at epoch ${stored.epoch}`).join(', ')}`,
    });
  if (!found.some((counterexample) => counterexample.invariant === 3)) {
    const metadata = json(world.storage.values.get(metadataKey));
    const restarted = open(world);
    const local = await restarted.repository.snapshotData();
    restarted.repository.dispose();
    const left = [
      metadata.completedDeletionId !== intent &&
        `completedDeletionId=${shown(metadata.completedDeletionId)}`,
      metadata.deleting !== false && `deleting=${shown(metadata.deleting)}`,
      metadata.clearing !== false && `clearing=${shown(metadata.clearing)}`,
      local.attempts.length > 0 && `${local.attempts.length} local completions`,
      local.journal.entries.length + local.journal.alternatives.length > 0 &&
        'local journal entries',
      world.storage.values.has(pendingKey) && 'delete-all-pending',
      !(captured !== null && server.epoch > captured) &&
        `server epoch ${server.epoch} with captured epoch ${captured}`,
    ].filter(Boolean);
    if (left.length)
      found.push({
        invariant: 3,
        said: `after the last retry the phone still has ${left.join(', ')}`,
      });
  }
  return found.map((counterexample): Counterexample => ({
    ...counterexample,
    events: schedule.events,
    story: schedule.story,
  }));
}

it(`resets the server at most once per delete-all intent under every schedule of up to ${bounds.faults} crashes or lost acknowledgements and ${bounds.others} other-device writes or deletes`, async () => {
  const seed = await synchronizedPhone();
  expect(seed.entries).toHaveLength(1);
  expect(seed.completions).toHaveLength(1);
  const shortest = new Map<number, Counterexample>();
  const reached = new Set<string>();
  for (
    let schedule: Schedule | null = new Schedule();
    schedule;
    schedule = schedule.next()
  ) {
    for (const counterexample of await explore(seed, schedule)) {
      const best = shortest.get(counterexample.invariant);
      if (
        !best ||
        counterexample.events < best.events ||
        (counterexample.events === best.events &&
          counterexample.story.length < best.story.length)
      )
        shortest.set(counterexample.invariant, counterexample);
    }
    for (const choice of schedule.choices)
      reached.add(`${choice.kind}:${choice.options[choice.picked]}`);
  }
  expect(
    [...shortest.values()]
      .sort((a, b) => a.invariant - b.invariant)
      .map(
        ({ invariant, said, story }) =>
          `Invariant ${invariant}: ${said}\n${story.map((line, index) => `  ${index + 1}. ${line}`).join('\n')}`,
      ),
  ).toEqual([]);
  expect([...reached]).toEqual(
    expect.arrayContaining([
      'completions:otherWrite',
      'completions:otherDelete',
      'deleteData:otherWrite',
      'deleteData:otherDelete',
      'deleteData:crash',
      'deleteData:lostAck',
      'cloud-sync:crash',
      'data-epoch:crash',
      'journal:crash',
      'local journal:crash',
      'delete-all-pending:crash',
    ]),
  );
}, 60_000);
