// Stands in for the SuperwallExpo native module under Jest. The real
// expo-superwall store runs on top of it, and every native call is recorded.
type Listener = (payload: unknown) => void;
type Attributes = Record<string, unknown>;

export const nativeCalls: { method: string; args: unknown[] }[] = [];
const listeners = new Map<string, Set<Listener>>();
let alias = 0;
let attributes: Attributes = {};
let configureResult: Promise<void> = Promise.resolve();
let customerInfo: unknown = null;
// Each registered placement, granted when its test calls `grant`.
const placements: { handlerId: string; grant: () => void; fail: () => void }[] =
  [];

const anonymous = (): Attributes => ({
  aliasId: `$SuperwallAlias:${++alias}`,
  seed: alias,
  applicationInstalledAt: '2026-11-20T00:00:00Z',
});

const methods: Record<string, (...args: never[]) => unknown> = {
  configure: () => configureResult,
  getUserAttributes: () => Promise.resolve({ ...attributes }),
  getSubscriptionStatus: () => Promise.resolve({ status: 'INACTIVE' }),
  getCustomerInfo: () => Promise.resolve(customerInfo),
  registerPlacement: (
    _placement: string,
    _params: unknown,
    handlerId: string,
  ) =>
    new Promise<void>((grant, reject) => {
      placements.push({
        handlerId,
        grant: () => grant(),
        fail: () => reject(new Error('registerPlacement failed')),
      });
    }),
  identify: (userId: string) => {
    if (attributes.appUserId !== userId) {
      if (attributes.appUserId !== undefined) attributes = anonymous();
      attributes = { ...attributes, appUserId: userId };
    }
    return Promise.resolve();
  },
  reset: () => {
    attributes = anonymous();
    return Promise.resolve();
  },
  addListener: (event: string, listener: Listener) => {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(event, set);
    return { remove: () => set.delete(listener) };
  },
};

export const superwallNative = {
  reset() {
    nativeCalls.length = 0;
    listeners.clear();
    attributes = anonymous();
    configureResult = Promise.resolve();
    customerInfo = null;
    placements.length = 0;
  },
  setCustomerInfo(info: unknown) {
    customerInfo = info;
  },
  /** The newest registered placement. */
  placement: () => placements.at(-1),
  emit(event: string, payload: unknown) {
    for (const listener of listeners.get(event) ?? []) listener(payload);
  },
  identifiedAs(userId: string) {
    attributes = { ...anonymous(), appUserId: userId };
  },
  holdConfigure() {
    let release = () => {};
    configureResult = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => release();
  },
  failNext(method: string) {
    const original = methods[method]!;
    methods[method] = () => {
      methods[method] = original;
      return Promise.reject(new Error(`${method} failed`));
    };
  },
  listenerCount: () =>
    [...listeners.values()].reduce((total, set) => total + set.size, 0),
  attributes: () => ({ ...attributes }),
};
superwallNative.reset();

export default new Proxy(
  {},
  {
    get: (_target, method: string) => {
      if (method === '__esModule') return false;
      return (...args: unknown[]) => {
        nativeCalls.push({ method, args });
        const implementation = methods[method];
        return implementation
          ? implementation(...(args as never[]))
          : Promise.resolve(undefined);
      };
    },
  },
);
