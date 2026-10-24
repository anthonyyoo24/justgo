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
  private queue: Promise<void> = Promise.resolve();
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
  private enqueue(work: () => Promise<void>) {
    const task = this.queue.then(async () => {
      try {
        await work();
        return true;
      } catch {
        return false;
      }
    });
    this.queue = task.then(() => {});
    return task;
  }
  private remove(key: string) {
    this.invalidated.add(key);
    // enqueue owns storage failures; expose their safe status without private data.
    void this.enqueue(() => this.storage.removeItem(key)).then((ok) => {
      if (!ok) this.publish({ storageUnavailable: true });
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
    if (previous && this.origin) this.remove(this.key(previous));
    if (!owner || !key || !hydrating) return;
    let raw: string | null = null;
    // Reads and removals share the write queue so logout cannot race an old save.
    void this.enqueue(async () => {
      raw = await this.storage.getItem(key);
    }).then((ok) => {
      if (generation !== this.generation || revision !== this.revision) return;
      this.publish({
        approval:
          ok && this.origin
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
    this.revision++;
    const approval = this.origin
      ? createBetaApproval(access, this.origin, owner, receivedAt)
      : null;
    if (!approval) {
      // A successful non-approval response is authoritative. Old beta query data
      // cannot keep granting access while its persisted record is being removed.
      this.publish({ approval: null, hydrating: false });
      if (this.origin) this.remove(this.key(owner));
      return;
    }
    const key = this.key(owner);
    // A slow optional cache must not hold a freshly approved tester at startup.
    this.publish({ approval, hydrating: false });
    const ok = await this.enqueue(() =>
      this.storage.setItem(key, JSON.stringify(approval)),
    );
    if (!this.current(lease)) return;
    if (ok) this.invalidated.delete(key);
    this.publish({ storageUnavailable: !ok });
  }
}
