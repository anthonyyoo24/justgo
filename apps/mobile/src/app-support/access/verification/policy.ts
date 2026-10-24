import {
  accessResponseSchema,
  hasVerifiedAccess,
  type AccessResponse,
} from '@justgo/contracts';

export type AccessOwner = { id: string; kind: 'account' | 'guest' };
export type BetaApproval = {
  version: 1;
  origin: string;
  owner: AccessOwner;
  receivedAt: number;
  access: Extract<AccessResponse, { status: 'verified' }>;
};

export function serverClockOffset(
  access: AccessResponse | undefined,
  receivedAt: number,
) {
  const ahead = access ? Date.parse(access.checkedAt) - receivedAt : 0;
  return ahead > 0 && ahead <= 5_000 ? ahead : 0;
}

/** Only a fresh server-issued beta response can create an offline approval. */
export function createBetaApproval(
  access: AccessResponse,
  origin: string,
  owner: AccessOwner,
  receivedAt: number,
): BetaApproval | null {
  if (
    access.status !== 'verified' ||
    access.source !== 'free_beta' ||
    !Number.isSafeInteger(receivedAt) ||
    receivedAt < 0 ||
    !hasVerifiedAccess(
      access,
      receivedAt + serverClockOffset(access, receivedAt),
    )
  )
    return null;
  return { version: 1, origin, owner: { ...owner }, receivedAt, access };
}

export function approvalExpiresAt(approval: BetaApproval) {
  return (
    Date.parse(approval.access.expiresAt) -
    serverClockOffset(approval.access, approval.receivedAt)
  );
}

export function hasBetaApproval(approval: BetaApproval | null, now: number) {
  return (
    !!approval &&
    now + serverClockOffset(approval.access, approval.receivedAt) >=
      Date.parse(approval.access.checkedAt) &&
    now < approvalExpiresAt(approval)
  );
}

/** Stored metadata cannot carry approval across owners, access modes or APIs. */
export function readBetaApproval(
  raw: string | null,
  origin: string,
  owner: AccessOwner,
  now: number,
): BetaApproval | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const record = value as Record<string, unknown>;
    const storedOwner = record.owner;
    if (
      record.version !== 1 ||
      record.origin !== origin ||
      !storedOwner ||
      typeof storedOwner !== 'object' ||
      Array.isArray(storedOwner) ||
      (storedOwner as Record<string, unknown>).id !== owner.id ||
      (storedOwner as Record<string, unknown>).kind !== owner.kind ||
      typeof record.receivedAt !== 'number'
    )
      return null;
    const access = accessResponseSchema.safeParse(record.access);
    if (!access.success) return null;
    const approval = createBetaApproval(
      access.data,
      origin,
      owner,
      record.receivedAt,
    );
    return hasBetaApproval(approval, now) ? approval : null;
  } catch {
    return null;
  }
}
