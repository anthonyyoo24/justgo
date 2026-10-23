import { z } from 'zod';

export const ICLOUD_PAGE_LIMIT = 50;
export const ICLOUD_VALUE_LIMIT = 65_536;
// Leave room for CloudKit's native record metadata and the atomic root update.
export const ICLOUD_WRITE_BYTE_LIMIT = 1_000_000;
export const ICLOUD_PREFERENCE_KEY = 'justgo:icloud:v1';

export const iCloudUtf8Bytes = (value: string) =>
  // Count surrogate pairs without relying on native TextEncoder availability.
  encodeURIComponent(value).replace(/%[A-F\d]{2}/gi, 'x').length;

export const iCloudCollectionSchema = z.union([
  z.literal('guest'),
  z.templateLiteral(['account:', z.uuid()]),
]);
export type ICloudCollection = z.infer<typeof iCloudCollectionSchema>;
export const iCloudValueSchema = z
  .object({
    id: z.uuid(),
    value: z.string().min(1).max(ICLOUD_VALUE_LIMIT),
  })
  .strict()
  .refine(({ value }) => {
    try {
      JSON.parse(value);
      return iCloudUtf8Bytes(value) <= ICLOUD_VALUE_LIMIT;
    } catch {
      return false;
    }
  });
export type ICloudValue = z.infer<typeof iCloudValueSchema>;
export const iCloudStatusSchema = z
  .object({
    status: z.enum([
      'available',
      'not_authenticated',
      'restricted',
      'unavailable',
      'not_configured',
      'unsupported',
    ]),
    accountToken: z
      .string()
      .regex(/^[a-f\d]{64}$/)
      .nullable(),
    enabled: z.boolean(),
  })
  .strict();
export type ICloudStatus = z.infer<typeof iCloudStatusSchema>;
export const iCloudGenerationSchema = z
  .object({ generation: z.uuid() })
  .strict();
export const iCloudPageSchema = iCloudGenerationSchema
  .extend({
    revision: z.string().min(1).max(1024).nullable().default(null),
    wasReset: z.boolean(),
    recovered: z.boolean().optional(),
    closed: z.boolean(),
    records: z.array(iCloudValueSchema).max(ICLOUD_PAGE_LIMIT),
    cursor: z.string().min(1).max(32_768),
    hasMore: z.boolean(),
  })
  .strict()
  .refine(
    ({ records }) =>
      new Set(records.map(({ id }) => id.toLowerCase())).size ===
      records.length,
  );
export type ICloudPage = z.infer<typeof iCloudPageSchema>;
export const iCloudPurgePageSchema = iCloudGenerationSchema
  .extend({ cursor: z.string().min(1).max(32_768), hasMore: z.boolean() })
  .strict();
export type ICloudPurgePage = z.infer<typeof iCloudPurgePageSchema>;
export const iCloudPreferenceSchema = z
  .object({
    // Version 1 enabled native access before the first sync completed.
    version: z.union([z.literal(1), z.literal(2)]).default(1),
    enabled: z.boolean(),
    accountToken: iCloudStatusSchema.shape.accountToken,
  })
  .strict();

const errorCodes = [
  'UNAVAILABLE',
  'NOT_CONFIGURED',
  'NOT_AUTHENTICATED',
  'RESTRICTED',
  'QUOTA_EXCEEDED',
  'ACCOUNT_CHANGED',
  'DISABLED',
  'CONFLICT',
  'STALE_GENERATION',
  'INVALID_DATA',
  'CURSOR_EXPIRED',
  'UNSUPPORTED',
  'RESET_CONFIRMATION_REQUIRED',
  'COLLECTION_DELETED',
  'HANDOVER_PENDING',
  'ZONE_RECOVERY_REQUIRED',
] as const;
export type ICloudErrorCode = (typeof errorCodes)[number];
export class ICloudError extends Error {
  constructor(readonly code: ICloudErrorCode) {
    super(code);
    this.name = 'ICloudError';
  }
}
export function iCloudError(error: unknown): ICloudError {
  if (error instanceof ICloudError) return error;
  // Only recognize the native module's sanitized codes. Do not pass raw
  // provider errors, user-record identifiers or payloads to UI/diagnostics.
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : '';
  const code = errorCodes.find((code) =>
    message.includes(`JUSTGO_ICLOUD_${code}`),
  );
  return new ICloudError(code ?? 'UNAVAILABLE');
}

export interface ICloudSync {
  status(): Promise<ICloudStatus>;
  setEnabled(enabled: false): Promise<void>;
  /** Persist on only after this fenced first synchronization succeeds. */
  setEnabled(
    enabled: true,
    synchronize: () => Promise<void>,
    isCurrent?: () => boolean,
  ): Promise<void>;
  /** Pinned access for explicit migration/deletion, without enabling background sync. */
  withMaintenance?(
    accountToken: string,
    action: (access: ICloudSync) => Promise<void>,
  ): Promise<void>;
  read(input: {
    collection: ICloudCollection;
    cursor?: string;
  }): Promise<ICloudPage>;
  write(input: {
    collection: ICloudCollection;
    generation: string;
    records: readonly ICloudValue[];
  }): Promise<{ generation: string }>;
  reset(input: {
    collection: ICloudCollection;
    generation: string;
    expectedRevision?: string;
  }): Promise<{ generation: string }>;
  close(input: {
    collection: ICloudCollection;
    generation: string;
  }): Promise<{ generation: string }>;
  purge(input: {
    collection: ICloudCollection;
    generation: string;
    cursor?: string;
  }): Promise<ICloudPurgePage>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
