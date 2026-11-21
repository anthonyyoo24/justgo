import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
import { outboundFetch } from '../http/outbound-fetch.js';

export type AppleEnvironment = 'Production' | 'Sandbox';
export type AppleBillingConfig = {
  keyId: string;
  issuerId: string;
  bundleId: string;
  privateKey: string;
  environment: AppleEnvironment;
};
export type VerifiedTransaction = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  environment: AppleEnvironment;
  expiresAt: Date;
  revokedAt: Date | null;
  appAccountToken: string | null;
  /** When Apple signed this answer, which orders answers about the same period. */
  signedAt: Date;
  /** The period is a free trial, from any offer Apple signed with it. */
  trial: boolean;
  /**
   * Whether the subscription renews at this expiry, from Apple's signed
   * renewal info. Null when the answer carries none, as Get Transaction Info's
   * never does.
   */
  autoRenew: boolean | null;
};
export type AppleTransactionReader = (
  transactionId: string,
) => Promise<VerifiedTransaction>;
export type AppleSubscriptionReader = (
  originalTransactionId: string,
) => Promise<VerifiedTransaction>;

/** SHA-256 of Apple Root CA - G3 (apple.com/certificateauthority), the root of every App Store signature. */
export const appleRootFingerprints = [
  '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179',
];
const origins: Record<AppleEnvironment, string> = {
  Production: 'https://api.storekit.itunes.apple.com',
  Sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
};

const oids = {
  leaf: '1.2.840.113635.100.6.11.1',
  intermediate: '1.2.840.113635.100.6.2.1',
  ecPublicKey: '1.2.840.10045.2.1',
  p256: '1.2.840.10045.3.1.7',
  p384: '1.3.132.0.34',
  sha256: '1.2.840.10045.4.3.2',
  sha384: '1.2.840.10045.4.3.3',
  basicConstraints: '2.5.29.19',
};
const transactionIdSchema = z.string().regex(/^[0-9]{1,32}$/);
// Apple's issuer IDs and app account tokens are UUIDs of any version.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const payloadSchema = z.object({
  transactionId: transactionIdSchema,
  originalTransactionId: transactionIdSchema,
  bundleId: z.string(),
  productId: z.string().regex(/^[A-Za-z0-9._]{1,255}$/),
  type: z.string(),
  environment: z.string(),
  expiresDate: z.number().int().positive(),
  revocationDate: z.number().int().positive().optional(),
  signedDate: z.number().int().positive(),
  appAccountToken: z.union([z.literal(''), z.string().regex(uuid)]).optional(),
  offerDiscountType: z.string().optional(),
});
// Apple's JWSRenewalInfoDecodedPayload: 1 renews at the expiry, 0 does not.
const renewalSchema = z.object({
  originalTransactionId: transactionIdSchema,
  environment: z.string(),
  autoRenewStatus: z.union([z.literal(0), z.literal(1)]),
});

type Bytes = Uint8Array<ArrayBuffer>;
type Der = { tag: number; end: number; raw: Bytes; body: Bytes };
type Certificate = {
  tbs: Bytes;
  signatureAlgorithm: string;
  signature: Bytes;
  issuer: Bytes;
  subject: Bytes;
  notBefore: number;
  notAfter: number;
  spki: Bytes;
  curve: string;
  extensions: Map<string, Bytes>;
};

/** The reason stays in the server error report and never reaches the client. */
function reject(reason: string): never {
  throw new Error(`Apple signature rejected: ${reason}`);
}
const bytes = (text: string, encoding: 'base64' | 'base64url'): Bytes =>
  new Uint8Array(Buffer.from(text, encoding));
const json = (part: string): unknown => {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return reject('JSON');
  }
};

function read(source: Bytes, offset = 0): Der {
  const tag = source[offset],
    first = source[offset + 1];
  if (tag === undefined || first === undefined) return reject('DER');
  let length = first,
    header = 2;
  if (first & 0x80) {
    const count = first & 0x7f;
    if (count < 1 || count > 3) return reject('DER');
    length = 0;
    for (let index = 0; index < count; index++) {
      const next = source[offset + 2 + index];
      if (next === undefined) return reject('DER');
      length = length * 256 + next;
    }
    header += count;
  }
  const end = offset + header + length;
  if (end > source.length) return reject('DER');
  return {
    tag,
    end,
    raw: source.subarray(offset, end),
    body: source.subarray(offset + header, end),
  };
}
function children(source: Bytes): Der[] {
  const nodes: Der[] = [];
  for (let offset = 0; offset < source.length;) {
    const node = read(source, offset);
    nodes.push(node);
    offset = node.end;
  }
  return nodes;
}
function tagged(node: Der | undefined, tag: number): Der {
  if (node?.tag !== tag) return reject('DER');
  return node;
}
function oid(node: Der | undefined): string {
  const body = tagged(node, 0x06).body;
  const first = body[0];
  if (first === undefined) return reject('OID');
  const parts = [Math.floor(first / 40), first % 40];
  let value = 0;
  for (const byte of body.subarray(1)) {
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}
function time(node: Der | undefined): number {
  const text = new TextDecoder().decode(node?.body);
  const match =
    node?.tag === 0x17
      ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(text)
      : node?.tag === 0x18
        ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(text)
        : null;
  if (!match) return reject('TIME');
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (year === undefined || month === undefined) return reject('TIME');
  return Date.UTC(
    node?.tag === 0x17 ? (year >= 50 ? 1900 : 2000) + year : year,
    month - 1,
    day,
    hour,
    minute,
    second,
  );
}

function certificate(der: Bytes): Certificate {
  const outer = tagged(read(der), 0x30);
  if (outer.end !== der.length) return reject('DER');
  const [tbs, algorithm, signature, ...extra] = children(outer.body);
  if (extra.length) return reject('DER');
  const fields = children(tagged(tbs, 0x30).body);
  const [, , issuer, validity, subject, spki, ...optional] = fields.slice(
    fields[0]?.tag === 0xa0 ? 1 : 0,
  );
  const [notBefore, notAfter] = children(tagged(validity, 0x30).body);
  const [keyAlgorithm] = children(tagged(spki, 0x30).body);
  const [keyType, curve] = children(tagged(keyAlgorithm, 0x30).body);
  if (oid(keyType) !== oids.ecPublicKey) return reject('KEY_TYPE');
  const extensions = new Map<string, Bytes>();
  for (const field of optional) {
    if (field.tag !== 0xa3) continue;
    const [list] = children(field.body);
    for (const extension of children(tagged(list, 0x30).body)) {
      const parts = children(tagged(extension, 0x30).body);
      extensions.set(oid(parts[0]), tagged(parts.at(-1), 0x04).body);
    }
  }
  const bits = tagged(signature, 0x03).body;
  if (bits[0] !== 0) return reject('DER');
  return {
    tbs: tagged(tbs, 0x30).raw,
    signatureAlgorithm: oid(children(tagged(algorithm, 0x30).body)[0]),
    signature: bits.subarray(1),
    issuer: tagged(issuer, 0x30).raw,
    subject: tagged(subject, 0x30).raw,
    notBefore: time(notBefore),
    notAfter: time(notAfter),
    spki: tagged(spki, 0x30).raw,
    curve: oid(curve),
    extensions,
  };
}

/** WebCrypto verifies ECDSA in the raw r||s form, not X.509's DER sequence. */
function rawSignature(der: Bytes, size: number): Bytes {
  const outer = tagged(read(der), 0x30);
  const [r, s, ...extra] = children(outer.body);
  if (outer.end !== der.length || extra.length) return reject('SIGNATURE');
  const raw = new Uint8Array(size * 2);
  for (const [index, integer] of [r, s].entries()) {
    const value = tagged(integer, 0x02).body;
    let start = 0;
    while (start < value.length - 1 && value[start] === 0) start++;
    const trimmed = value.subarray(start);
    if (trimmed.length > size) return reject('SIGNATURE');
    raw.set(trimmed, index * size + size - trimmed.length);
  }
  return raw;
}
function curveOf(certificate: Certificate) {
  if (certificate.curve === oids.p256) return { namedCurve: 'P-256', size: 32 };
  if (certificate.curve === oids.p384) return { namedCurve: 'P-384', size: 48 };
  return reject('CURVE');
}
function hashOf(algorithm: string) {
  if (algorithm === oids.sha256) return 'SHA-256';
  if (algorithm === oids.sha384) return 'SHA-384';
  return reject('SIGNATURE_ALGORITHM');
}
const publicKey = (certificate: Certificate) =>
  crypto.subtle.importKey(
    'spki',
    certificate.spki,
    { name: 'ECDSA', namedCurve: curveOf(certificate).namedCurve },
    false,
    ['verify'],
  );
function same(left: Bytes, right: Bytes) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
async function signs(parent: Certificate, child: Certificate) {
  if (!same(child.issuer, parent.subject)) return false;
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: hashOf(child.signatureAlgorithm) },
    await publicKey(parent),
    rawSignature(child.signature, curveOf(parent).size),
    child.tbs,
  );
}
function isAuthority(certificate: Certificate) {
  const value = certificate.extensions.get(oids.basicConstraints);
  if (!value) return false;
  const [first] = children(tagged(read(value), 0x30).body);
  return first?.tag === 0x01 && first.body[0] === 0xff;
}
async function fingerprint(der: Bytes) {
  return Buffer.from(await crypto.subtle.digest('SHA-256', der)).toString(
    'hex',
  );
}

/**
 * Verify an App Store JWS against a pinned root, checking the chain the way
 * Apple's library does: Apple's marker OIDs, CA flags, each signature and each
 * validity period at `now`. Returns the payload, still untyped.
 */
export async function verifySignedPayload(
  jws: string,
  options: { rootFingerprints: readonly string[]; now: number },
): Promise<unknown> {
  const parts = jws.split('.');
  const [headerPart, payloadPart, signaturePart] = parts;
  if (
    parts.length !== 3 ||
    !headerPart ||
    !payloadPart ||
    !signaturePart ||
    !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  )
    return reject('SHAPE');
  const header = z
    .object({
      alg: z.literal('ES256'),
      x5c: z.tuple([z.string(), z.string(), z.string()]),
    })
    .safeParse(json(headerPart));
  if (!header.success) return reject('HEADER');
  const chain = header.data.x5c.map((entry) => bytes(entry, 'base64'));
  const [leafDer, intermediateDer, rootDer] = chain;
  if (!leafDer || !intermediateDer || !rootDer) return reject('HEADER');
  if (!options.rootFingerprints.includes(await fingerprint(rootDer)))
    return reject('ROOT_NOT_PINNED');
  const [leaf, intermediate, root] = chain.map(certificate);
  if (!leaf || !intermediate || !root) return reject('HEADER');
  for (const entry of [leaf, intermediate, root])
    if (options.now < entry.notBefore || options.now > entry.notAfter)
      return reject('VALIDITY');
  if (!leaf.extensions.has(oids.leaf)) return reject('LEAF_OID');
  if (!intermediate.extensions.has(oids.intermediate))
    return reject('INTERMEDIATE_OID');
  if (!isAuthority(intermediate) || !isAuthority(root))
    return reject('NOT_AUTHORITY');
  if (leaf.curve !== oids.p256) return reject('LEAF_CURVE');
  if (!(await signs(root, root))) return reject('ROOT_SIGNATURE');
  if (!(await signs(root, intermediate)))
    return reject('INTERMEDIATE_SIGNATURE');
  if (!(await signs(intermediate, leaf))) return reject('LEAF_SIGNATURE');
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    await publicKey(leaf),
    bytes(signaturePart, 'base64url'),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) return reject('SIGNATURE');
  return json(payloadPart);
}

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
function signingKey(pem: string) {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  return crypto.subtle.importKey(
    'pkcs8',
    bytes(body, 'base64'),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}
/** App Store Server API bearer: ES256, five minutes, scoped to the bundle. */
async function bearerToken(
  config: AppleBillingConfig,
  key: CryptoKey,
  now: number,
) {
  const issuedAt = Math.floor(now / 1000);
  const input = `${base64url({ alg: 'ES256', kid: config.keyId, typ: 'JWT' })}.${base64url(
    {
      iss: config.issuerId,
      iat: issuedAt,
      exp: issuedAt + 300,
      aud: 'appstoreconnect-v1',
      bid: config.bundleId,
    },
  )}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}

type AppleClientOptions = {
  transport?: typeof fetch;
  rootFingerprints?: readonly string[];
  now?: () => number;
};

/**
 * The App Store Server API calls both readers share. Apple I/O goes through
 * outboundFetch(), so it fails before sending inside an owner transaction.
 */
function appleClient(config: AppleBillingConfig, options: AppleClientOptions) {
  const request = outboundFetch(options.transport);
  const now = options.now ?? Date.now;
  const rootFingerprints = options.rootFingerprints ?? appleRootFingerprints;
  let key: Promise<CryptoKey> | undefined;
  /** GET one Apple path and parse its body, or fail as the API answers. */
  async function read<T>(path: string, body: z.ZodType<T>): Promise<T> {
    let response: Response;
    try {
      key ??= signingKey(config.privateKey);
      response = await request(new URL(path, origins[config.environment]), {
        headers: {
          authorization: `Bearer ${await bearerToken(config, await key, now())}`,
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ApiError('UNAVAILABLE', 503);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      // Apple answers 400 for a malformed ID and 404 for one it does not know.
      if (response.status === 400 || response.status === 404)
        throw new ApiError('NOT_FOUND', 404);
      throw new ApiError('UNAVAILABLE', 503);
    }
    try {
      return body.parse(await response.json());
    } catch {
      throw new ApiError('UNAVAILABLE', 503);
    }
  }
  /**
   * Verify a signed transaction for this app and environment. A broken chain
   * throws a plain Error (503, retryable). A payload that names another
   * transaction, app or environment answers 400.
   */
  async function transaction(
    signed: string,
    expected: { transactionId?: string; originalTransactionId?: string },
    signedRenewal?: string,
  ): Promise<VerifiedTransaction> {
    const payload = payloadSchema.safeParse(
      await verifySignedPayload(signed, { rootFingerprints, now: now() }),
    );
    if (
      !payload.success ||
      (expected.transactionId !== undefined &&
        payload.data.transactionId !== expected.transactionId) ||
      (expected.originalTransactionId !== undefined &&
        payload.data.originalTransactionId !==
          expected.originalTransactionId) ||
      payload.data.bundleId !== config.bundleId ||
      payload.data.environment !== config.environment ||
      payload.data.type !== 'Auto-Renewable Subscription'
    )
      throw new ApiError('INVALID_REQUEST', 400);
    const purchase = payload.data;
    let autoRenew: boolean | null = null;
    if (signedRenewal !== undefined) {
      const renewal = renewalSchema.safeParse(
        await verifySignedPayload(signedRenewal, {
          rootFingerprints,
          now: now(),
        }),
      );
      if (
        !renewal.success ||
        renewal.data.originalTransactionId !== purchase.originalTransactionId ||
        renewal.data.environment !== config.environment
      )
        throw new ApiError('INVALID_REQUEST', 400);
      autoRenew = renewal.data.autoRenewStatus === 1;
    }
    return {
      transactionId: purchase.transactionId,
      originalTransactionId: purchase.originalTransactionId,
      productId: purchase.productId,
      environment: config.environment,
      expiresAt: new Date(purchase.expiresDate),
      revokedAt:
        purchase.revocationDate === undefined
          ? null
          : new Date(purchase.revocationDate),
      appAccountToken: purchase.appAccountToken
        ? purchase.appAccountToken.toLowerCase()
        : null,
      signedAt: new Date(purchase.signedDate),
      // A free trial from an introductory offer, an offer code or a promotion.
      trial: purchase.offerDiscountType === 'FREE_TRIAL',
      autoRenew,
    };
  }
  return { read, transaction };
}

const signedTransaction = z.string().max(64 * 1024);

/** Read one transaction from Apple's Get Transaction Info and verify it. */
export function createAppleTransactions(
  config: AppleBillingConfig,
  options: AppleClientOptions = {},
): AppleTransactionReader {
  const apple = appleClient(config, options);
  return async (transactionId) => {
    if (!transactionIdSchema.safeParse(transactionId).success)
      throw new ApiError('INVALID_REQUEST', 400);
    const { signedTransactionInfo } = await apple.read(
      `/inApps/v1/transactions/${transactionId}`,
      z.object({ signedTransactionInfo: signedTransaction }),
    );
    return apple.transaction(signedTransactionInfo, { transactionId });
  };
}

/**
 * Read a subscription's latest transaction from Apple's Get All Subscription
 * Statuses and verify it, with the renewal info Apple lists beside it. This is
 * Apple's current answer, so it carries a renewal, an expiry, a refund or a
 * change to auto-renew whatever order the events arrived in.
 */
export function createAppleSubscriptions(
  config: AppleBillingConfig,
  options: AppleClientOptions = {},
): AppleSubscriptionReader {
  const apple = appleClient(config, options);
  return async (originalTransactionId) => {
    if (!transactionIdSchema.safeParse(originalTransactionId).success)
      throw new ApiError('INVALID_REQUEST', 400);
    const statuses = await apple.read(
      `/inApps/v1/subscriptions/${originalTransactionId}`,
      z.object({
        data: z
          .array(
            z.object({
              lastTransactions: z
                .array(
                  z.object({
                    originalTransactionId: z.string(),
                    signedTransactionInfo: signedTransaction,
                    signedRenewalInfo: signedTransaction.optional(),
                  }),
                )
                .max(100),
            }),
          )
          .max(100),
      }),
    );
    const latest = statuses.data
      .flatMap((group) => group.lastTransactions)
      .find((entry) => entry.originalTransactionId === originalTransactionId);
    if (!latest) throw new ApiError('INVALID_REQUEST', 400);
    return apple.transaction(
      latest.signedTransactionInfo,
      { originalTransactionId },
      latest.signedRenewalInfo,
    );
  };
}
