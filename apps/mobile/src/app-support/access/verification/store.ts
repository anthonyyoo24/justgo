import type { AccessResponse } from '@justgo/contracts';
import {
  createBetaApproval,
  readBetaApproval,
  type AccessOwner,
  type BetaApproval,
} from './policy';

export interface AccessStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
type Snapshot = {
  owner: AccessOwner | null;
  approval: BetaApproval | null;
  hydrating: boolean;
  online: boolean;
  active: boolean;
  authenticated: boolean;
  storageUnavailable: boolean;
};
type RequestLease = { generation: number; request: number };

export function sameAccessOwner(a: AccessOwner | null, b: AccessOwner | null) {
  return a?.id === b?.id && a?.kind === b?.kind;
}

export class AccessStore {
  private state: Snapshot = {
    owner: null,
    approval: null,
    hydrating: false,
    online: true,
    active: true,
    authenticated: false,
    storageUnavailable: false,
  };
  private generation = 0;
  private request = 0;
  private revision = 0;
  private queues = {
    cache: Promise.resolve(),
    recovery: Promise.resolve(),
  };
  private invalidated = new Set<string>();
  private listeners = new Set<() => void>();
  constructor(
    private readonly origin: string | null,
    private readonly storage: AccessStorage,
    private readonly now: () => number = Date.now,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<Snapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private key(owner: AccessOwner) {
    // Existing account erasure removes this namespace. Backups/cloud adoption
    // copy explicit activity records, never this local admission metadata.
    return `justgo:v1:${owner.id}:access:${owner.kind}:${encodeURIComponent(this.origin ?? '')}`;
  }
  private enqueue(
    work: () => Promise<void>,
    lane: 'cache' | 'recovery' = 'cache',
  ) {
    const task = this.queues[lane].then(async () => {
      try {
        await work();
        return true;
      } catch {
        return false;
      }
    });
    this.queues[lane] = task.then(() => {});
    return task;
  }
  private invalidate(key: string) {
    this.invalidated.add(key);
    // Denial must reach disk independently of a slow optional approval write.
    // Keep this proof even if removing the old approval fails or is interrupted.
    const recovery = this.enqueue(
      () => this.storage.setItem(`${key}:recovery`, 'denied:v1'),
      'recovery',
    );
    // Schedule deletion before yielding, so a later approval saves after it.
    // Both queues own failures and expose only a safe storage status.
    void this.enqueue(() => this.storage.removeItem(key)).then((ok) => {
      if (!ok) this.publish({ storageUnavailable: true });
    });
    return recovery.then((ok) => {
      if (!ok) this.publish({ storageUnavailable: true });
      return ok;
    });
  }
  changeOwner(owner: AccessOwner | null) {
    if (sameAccessOwner(this.state.owner, owner)) return;
    const previous = this.state.owner;
    const generation = ++this.generation;
    const revision = ++this.revision;
    this.request++;
    const key = owner && this.origin ? this.key(owner) : null;
    const hydrating = !!key && !this.invalidated.has(key);
    this.publish({
      owner,
      approval: null,
      hydrating,
      storageUnavailable: false,
    });
    if (previous && this.origin) void this.invalidate(this.key(previous));
    if (!owner || !key || !hydrating) return;
    let raw: string | null = null;
    let recovery: string | null = null;
    // Reads and removals share the write queue so logout cannot race an old save.
    void this.enqueue(async () => {
      [raw, recovery] = await Promise.all([
        this.storage.getItem(key),
        this.storage.getItem(`${key}:recovery`),
      ]);
    }).then((ok) => {
      if (generation !== this.generation || revision !== this.revision) return;
      this.publish({
        approval:
          ok && this.origin && raw === recovery
            ? readBetaApproval(raw, this.origin, owner, this.now())
            : null,
        hydrating: false,
        storageUnavailable: !ok,
      });
    });
  }
  setEnvironment(environment: { online: boolean; active: boolean }) {
    if (
      environment.online !== this.state.online ||
      environment.active !== this.state.active
    )
      this.publish(environment);
  }
  setAuthenticated(authenticated: boolean) {
    if (authenticated !== this.state.authenticated)
      this.publish({ authenticated });
  }
  /** Drain both lanes and any dependent proof work before account erasure. */
  async settled() {
    let cache: Promise<void>, recovery: Promise<void>;
    do {
      cache = this.queues.cache;
      recovery = this.queues.recovery;
      await Promise.all([cache, recovery]);
    } while (cache !== this.queues.cache || recovery !== this.queues.recovery);
  }
  beginRequest(owner: AccessOwner): RequestLease | null {
    return sameAccessOwner(owner, this.state.owner)
      ? { generation: this.generation, request: ++this.request }
      : null;
  }
  private current(lease: RequestLease) {
    return (
      lease.generation === this.generation && lease.request === this.request
    );
  }
  async receive(
    lease: RequestLease,
    access: AccessResponse,
    receivedAt: number,
  ) {
    const owner = this.state.owner;
    if (!owner || !this.current(lease)) return;
    const generation = this.generation;
    const revision = ++this.revision;
    // Beginning a later poll is not a newer server decision. Its transport may
    // fail while this accepted decision still needs to finish safe persistence.
    const currentDecision = () =>
      generation === this.generation && revision === this.revision;
    const approval = this.origin
      ? createBetaApproval(access, this.origin, owner, receivedAt)
      : null;
    if (!approval) {
      // A successful non-approval response is authoritative. Old beta query data
      // cannot keep granting access while its persisted record is being removed.
      this.publish({ approval: null, hydrating: false });
      if (this.origin) await this.invalidate(this.key(owner));
      return;
    }
    const key = this.key(owner);
    const raw = JSON.stringify(approval);
    // A slow optional cache must not hold a freshly approved tester at startup.
    this.publish({ approval, hydrating: false });
    const saved = await this.enqueue(() => this.storage.setItem(key, raw));
    if (!currentDecision()) return;
    // A proof admits only these exact bytes. It cannot revive an older cached
    // grant, and only a current successful approval may supersede a denial.
    const ok =
      saved &&
      (await this.enqueue(async () => {
        if (currentDecision())
          await this.storage.setItem(`${key}:recovery`, raw);
      }, 'recovery'));
    if (!currentDecision()) return;
    if (ok) this.invalidated.delete(key);
    else await this.invalidate(key);
    if (!currentDecision()) return;
    this.publish({ storageUnavailable: !ok });
  }
}
