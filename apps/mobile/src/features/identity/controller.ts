import { getRandomValues, randomUUID } from 'expo-crypto';
import {
  credentialsResponseSchema,
  devicesResponseSchema,
  okSchema,
  secretSchema,
  sessionResponseSchema,
  transferCodeSchema,
  transferResponseSchema,
  type SessionProposal,
  type SessionResponse,
  type TransferResponse,
} from '@justgo/contracts';
import type { z } from 'zod';
import { IdentityClientError, type IdentityApi } from './api';
import type { CredentialVault, DeviceState, StoredCredential } from './storage';

type Snapshot = {
  busy: boolean;
  initialized: boolean;
  hasPending: boolean;
  account: SessionResponse | null;
  message: string;
  credentials: { id: string }[];
  key: string | null;
  transfer: (TransferResponse & { code: string }) | null;
  inspection: (TransferResponse & { code: string }) | null;
  devices: z.infer<typeof devicesResponseSchema>['devices'];
  recoveryKeys: z.infer<typeof credentialsResponseSchema>['credentials'];
};
type Random = { id: () => string; secret: () => string };
const secureRandom: Random = {
  id: randomUUID,
  secret: () =>
    Array.from(getRandomValues(new Uint8Array(32)), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join(''),
};
const messages: Record<string, string> = {
  NETWORK:
    'Couldn’t connect. Retry when you’re online; your pending action is saved.',
  STORAGE: 'Secure storage is unavailable. Unlock your iPhone and retry.',
  CREDENTIAL_REJECTED:
    'This recovery credential is no longer valid. Try another recovery method.',
  SESSION_REVOKED:
    'This device session was revoked. Use a valid recovery method to continue.',
  SESSION_EXPIRED: 'Your session expired. Recover your account to continue.',
  UNAUTHORIZED:
    'Your session could not be verified. Use a recovery method to continue.',
  TRANSFER_PENDING:
    'Waiting for approval on your existing device. Check the matching numbers before approving.',
  TRANSFER_EXPIRED:
    'This transfer expired. Start a new transfer on this device.',
  RATE_LIMITED: 'Too many attempts. Wait 10 minutes before trying again.',
  CONFLICT:
    'This action no longer matches the saved request. Review your recovery options.',
  NOT_FOUND:
    'That recovery request wasn’t found. Check the code and try again.',
  INVALID_REQUEST: 'Check the recovery key or transfer code and try again.',
  UNAVAILABLE: 'The account service is unavailable. Please retry shortly.',
};
export class IdentityController {
  private data: DeviceState | null = null;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot = {
    busy: false,
    initialized: false,
    hasPending: false,
    account: null,
    message: '',
    credentials: [],
    key: null,
    transfer: null,
    inspection: null,
    devices: [],
    recoveryKeys: [],
  };
  constructor(
    readonly vault: CredentialVault,
    private readonly api: IdentityApi,
    private readonly random: Random = secureRandom,
  ) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snapshot;
  private update(value: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((fn) => fn());
  }
  private async save(value: DeviceState) {
    try {
      await this.vault.write(value);
      this.data = value;
      this.update({ hasPending: value.pending !== null });
    } catch {
      throw new IdentityClientError('STORAGE');
    }
  }
  private async credentials() {
    try {
      return await this.vault.credentials();
    } catch {
      throw new IdentityClientError('STORAGE');
    }
  }
  private async add(credential: StoredCredential) {
    try {
      await this.vault.add(credential);
    } catch {
      throw new IdentityClientError('STORAGE');
    }
  }
  private proposal(): SessionProposal {
    return {
      deviceId: this.data!.deviceId,
      sessionId: this.random.id(),
      sessionToken: this.random.secret(),
    };
  }
  private async run(work: () => Promise<void>) {
    if (this.snapshot.busy) return;
    this.update({ busy: true, message: '', key: null });
    try {
      await work();
    } catch (error) {
      const code =
        error instanceof IdentityClientError ? error.code : 'STORAGE';
      // Never silently mint another account after a revoked session or storage failure.
      if (
        [
          'SESSION_REVOKED',
          'SESSION_EXPIRED',
          'UNAUTHORIZED',
          'CREDENTIAL_REJECTED',
        ].includes(code)
      )
        this.update({ account: null, devices: [], recoveryKeys: [] });
      this.update({ message: messages[code] ?? messages.UNAVAILABLE! });
      if (code === 'NETWORK' && !this.data?.pending)
        this.update({
          message: 'Couldn’t connect. Check your connection and retry.',
        });
    } finally {
      this.update({ busy: false, initialized: true });
    }
  }
  private async ensureData() {
    if (this.data) return;
    try {
      this.data = await this.vault.read();
      this.update({ hasPending: this.data?.pending != null });
    } catch {
      throw new IdentityClientError('STORAGE');
    }
    if (!this.data)
      await this.save({
        deviceId: this.random.id(),
        selectedId: null,
        session: null,
        pending: null,
        savedKey: null,
        registration: null,
      });
  }
  initialize = () =>
    this.run(async () => {
      await this.ensureData();
      const credentials = await this.credentials();
      this.update({ credentials: credentials.map((c) => ({ id: c.id })) });
      if (this.data!.pending) {
        await this.resume();
        return;
      }
      if (this.data!.session) {
        await this.verify();
        return;
      }
      if (credentials.length === 1) {
        await this.prepareRecovery(credentials[0]!);
        return;
      }
      if (credentials.length > 1) {
        this.update({
          message:
            'More than one recovery credential is available. Choose the account to recover; accounts will stay separate.',
        });
        return;
      }
      if (this.vault.kind === 'keychain') await this.newAccount();
    });
  private async newAccount() {
    const credential = { id: this.random.id(), secret: this.random.secret() };
    // Persist the complete pending intent first, then the synchronizing item, then call the API.
    await this.save({
      ...this.data!,
      selectedId: credential.id,
      session: null,
      savedKey: null,
      registration: null,
      pending: {
        kind: 'bootstrap',
        credentialId: credential.id,
        secret: credential.secret,
        proposal: this.proposal(),
      },
    });
    this.update({
      account: null,
      devices: [],
      recoveryKeys: [],
      transfer: null,
      inspection: null,
    });
    await this.resume();
  }
  createAccount = () =>
    this.run(async () => {
      await this.ensureData();
      await this.newAccount();
    });
  private async finish(
    info: SessionResponse,
    proposal: SessionProposal,
    credentialId: string,
  ) {
    if (
      info.deviceId !== proposal.deviceId ||
      info.sessionId !== proposal.sessionId
    )
      throw new IdentityClientError('UNAVAILABLE');
    await this.save({
      ...this.data!,
      selectedId: credentialId,
      session: { token: proposal.sessionToken, info },
      pending: null,
    });
    this.update({
      account: info,
      transfer: null,
      message: 'Your account is connected.',
    });
    await this.loadLists();
  }
  private async resume() {
    const pending = this.data!.pending;
    if (!pending) return;
    if (pending.kind === 'transfer') {
      await this.add({
        id: pending.credentialId,
        secret: pending.input.credential,
      });
      this.update({
        credentials: (await this.credentials()).map((c) => ({ id: c.id })),
      });
      const transfer = await this.api.request(
        '/transfers/start',
        transferResponseSchema,
        pending.input,
      );
      this.update({
        transfer: { ...transfer, code: pending.input.code },
        message:
          'Enter this transfer code on your existing device, then compare the verification numbers.',
      });
      return;
    }
    if (pending.kind === 'renew') {
      const current = this.data!.session;
      if (!current) throw new IdentityClientError('UNAUTHORIZED');
      const info = await this.api.request(
        '/renew',
        sessionResponseSchema,
        {
          sessionId: pending.proposal.sessionId,
          sessionToken: pending.proposal.sessionToken,
        },
        current.token,
      );
      if (info.userId !== current.info.userId)
        throw new IdentityClientError('UNAVAILABLE');
      await this.finish(info, pending.proposal, this.data!.selectedId!);
      return;
    }
    if (pending.kind === 'bootstrap')
      await this.add({ id: pending.credentialId, secret: pending.secret });
    const credential = (await this.credentials()).find(
      (c) => c.id === pending.credentialId,
    );
    if (!credential) throw new IdentityClientError('STORAGE');
    const info = await this.api.request(
      pending.kind === 'bootstrap' ? '/bootstrap' : '/recover',
      sessionResponseSchema,
      { ...pending.proposal, credential: credential.secret },
    );
    await this.finish(info, pending.proposal, credential.id);
  }
  retry = () =>
    this.run(async () => {
      await this.ensureData();
      if (this.data!.pending) await this.resume();
      else if (this.data!.session) await this.verify();
      else
        this.update({
          credentials: (await this.credentials()).map((c) => ({ id: c.id })),
          message: 'Choose a recovery method to continue.',
        });
    });
  private async verify() {
    const session = this.data!.session!;
    try {
      const info = await this.api.request(
        '/me',
        sessionResponseSchema,
        undefined,
        session.token,
      );
      if (
        info.userId !== session.info.userId ||
        info.sessionId !== session.info.sessionId
      )
        throw new IdentityClientError('UNAVAILABLE');
      this.update({ account: info });
      if (Date.parse(info.expiresAt) - Date.now() < 24 * 60 * 60 * 1000) {
        await this.save({
          ...this.data!,
          pending: { kind: 'renew', proposal: this.proposal() },
        });
        await this.resume();
      } else await this.loadLists();
    } catch (error) {
      if (
        error instanceof IdentityClientError &&
        error.code === 'SESSION_EXPIRED'
      ) {
        const credential = (await this.credentials()).find(
          (c) => c.id === this.data!.selectedId,
        );
        if (credential) {
          await this.prepareRecovery(credential);
          return;
        }
      }
      throw error;
    }
  }
  private async prepareRecovery(
    credential: StoredCredential,
    newDevice = false,
  ) {
    if (newDevice)
      await this.save({ ...this.data!, deviceId: this.random.id() });
    await this.save({
      ...this.data!,
      selectedId: credential.id,
      session: null,
      savedKey: null,
      registration: null,
      pending: {
        kind: 'recover',
        credentialId: credential.id,
        proposal: this.proposal(),
      },
    });
    this.update({
      account: null,
      devices: [],
      recoveryKeys: [],
      transfer: null,
      inspection: null,
    });
    await this.resume();
  }
  recoverCredential = (id: string) =>
    this.run(async () => {
      await this.ensureData();
      const credential = (await this.credentials()).find((c) => c.id === id);
      if (!credential) throw new IdentityClientError('STORAGE');
      await this.prepareRecovery(credential, true);
    });
  recoverKey = (value: string) =>
    this.run(async () => {
      const parsed = secretSchema.safeParse(
        value.replace(/[\s-]/g, '').toLowerCase(),
      );
      if (!parsed.success) throw new IdentityClientError('INVALID_REQUEST');
      await this.ensureData();
      const credential = { id: this.random.id(), secret: parsed.data };
      await this.add(credential);
      await this.prepareRecovery(credential, true);
      // Register a separate synchronizing credential; a saved key remains independently revocable.
      const replacement = {
        id: this.random.id(),
        secret: this.random.secret(),
      };
      await this.save({ ...this.data!, registration: replacement });
      await this.registerSync();
    });
  private async registerSync() {
    const registration = this.data!.registration;
    if (!registration) return;
    await this.add(registration);
    await this.api.request(
      '/credentials',
      okSchema,
      { id: registration.id, credential: registration.secret, kind: 'sync' },
      this.data!.session!.token,
    );
    await this.save({
      ...this.data!,
      selectedId: registration.id,
      registration: null,
    });
  }
  private async loadLists() {
    if (this.data!.registration) await this.registerSync();
    const token = this.data!.session!.token;
    const devices = await this.api.request(
      '/devices',
      devicesResponseSchema,
      undefined,
      token,
    );
    const keys = await this.api.request(
      '/credentials',
      credentialsResponseSchema,
      undefined,
      token,
    );
    const savedKey = this.data!.savedKey;
    if (
      savedKey &&
      keys.credentials.some((key) => key.id === savedKey.id && key.revokedAt)
    ) {
      await this.save({ ...this.data!, savedKey: null });
      this.update({ key: null });
    }
    this.update({
      devices: devices.devices,
      recoveryKeys: keys.credentials,
      credentials: (await this.credentials()).map((c) => ({ id: c.id })),
    });
  }
  refresh = () =>
    this.run(async () => {
      await this.verify();
    });
  renew = () =>
    this.run(async () => {
      if (!this.data?.session) throw new IdentityClientError('UNAUTHORIZED');
      if (!this.data.pending)
        await this.save({
          ...this.data,
          pending: { kind: 'renew', proposal: this.proposal() },
        });
      await this.resume();
    });
  saveKey = () =>
    this.run(async () => {
      if (!this.data?.session) throw new IdentityClientError('UNAUTHORIZED');
      await this.loadLists();
      if (!this.data.savedKey)
        await this.save({
          ...this.data,
          savedKey: {
            id: this.random.id(),
            secret: this.random.secret(),
            registered: false,
          },
        });
      const key = this.data!.savedKey!;
      await this.api.request(
        '/credentials',
        okSchema,
        { id: key.id, credential: key.secret, kind: 'key' },
        this.data!.session!.token,
      );
      await this.save({
        ...this.data!,
        savedKey: { ...key, registered: true },
      });
      this.update({
        key: key.secret,
        message:
          'Keep this key somewhere private. Anyone with it can recover your account.',
      });
      await this.loadLists();
    });
  hideKey = () => this.update({ key: null });
  revokeCredential = (id: string) =>
    this.run(async () => {
      await this.api.request(
        `/credentials/${id}/revoke`,
        okSchema,
        {},
        this.data!.session!.token,
      );
      if (this.data!.savedKey?.id === id)
        await this.save({ ...this.data!, savedKey: null });
      await this.loadLists();
      this.update({
        message:
          'Recovery credential revoked. Existing device sessions remain active.',
      });
    });
  revokeDevice = (id: string) =>
    this.run(async () => {
      await this.api.request(
        `/devices/${id}/revoke`,
        okSchema,
        {},
        this.data!.session!.token,
      );
      if (id === this.data!.deviceId) {
        await this.save({ ...this.data!, session: null, pending: null });
        this.update({
          account: null,
          devices: [],
          recoveryKeys: [],
          message: 'This device has been revoked.',
        });
      } else await this.loadLists();
    });
  startTransfer = () =>
    this.run(async () => {
      await this.ensureData();
      const credential = { id: this.random.id(), secret: this.random.secret() };
      const input = {
        ...this.proposal(),
        credential: credential.secret,
        id: this.random.id(),
        code: this.random.secret().slice(0, 16).toUpperCase(),
        claimSecret: this.random.secret(),
      };
      await this.save({
        ...this.data!,
        session: null,
        selectedId: credential.id,
        savedKey: null,
        registration: null,
        pending: { kind: 'transfer', credentialId: credential.id, input },
      });
      this.update({ account: null, devices: [], recoveryKeys: [] });
      await this.resume();
    });
  redeemTransfer = () =>
    this.run(async () => {
      const pending = this.data?.pending;
      if (pending?.kind !== 'transfer')
        throw new IdentityClientError('NOT_FOUND');
      const info = await this.api.request(
        '/transfers/redeem',
        sessionResponseSchema,
        { code: pending.input.code, claimSecret: pending.input.claimSecret },
      );
      await this.finish(info, pending.input, pending.credentialId);
    });
  inspectTransfer = (value: string) =>
    this.run(async () => {
      this.update({ inspection: null });
      const parsed = transferCodeSchema.safeParse(
        value.replace(/[\s-]/g, '').toUpperCase(),
      );
      if (!parsed.success) throw new IdentityClientError('INVALID_REQUEST');
      const transfer = await this.api.request(
        '/transfers/inspect',
        transferResponseSchema,
        { code: parsed.data },
        this.data!.session!.token,
      );
      this.update({ inspection: { ...transfer, code: parsed.data } });
    });
  approveTransfer = () =>
    this.run(async () => {
      const transfer = this.snapshot.inspection;
      if (!transfer) throw new IdentityClientError('NOT_FOUND');
      await this.api.request(
        '/transfers/approve',
        okSchema,
        { code: transfer.code, verification: transfer.verification },
        this.data!.session!.token,
      );
      this.update({
        inspection: null,
        message:
          'Transfer approved. Return to your new device and finish recovery.',
      });
    });
}
