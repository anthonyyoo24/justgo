// A self-made App Store for tests: a three-certificate chain shaped like
// Apple's, a JWS signer and a Get Transaction Info stub. Nothing here calls Apple.
type Bytes = Uint8Array<ArrayBuffer>;

const concat = (...parts: (Uint8Array | number[])[]): Bytes => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
function length(size: number) {
  if (size < 0x80) return [size];
  const digits: number[] = [];
  for (let rest = size; rest > 0; rest = Math.floor(rest / 256))
    digits.unshift(rest % 256);
  return [0x80 | digits.length, ...digits];
}
const der = (tag: number, ...parts: (Uint8Array | number[])[]) => {
  const body = concat(...parts);
  return concat([tag, ...length(body.length)], body);
};
const sequence = (...parts: Uint8Array[]) => der(0x30, ...parts);
function integer(value: Uint8Array) {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start++;
  const trimmed = value.subarray(start);
  return der(0x02, (trimmed[0] ?? 0) & 0x80 ? [0] : [], trimmed);
}
function oid(text: string) {
  const [first = 0, second = 0, ...rest] = text.split('.').map(Number);
  const body = [first * 40 + second];
  for (const part of rest) {
    const digits = [part & 0x7f];
    for (
      let value = Math.floor(part / 128);
      value > 0;
      value = Math.floor(value / 128)
    )
      digits.unshift((value & 0x7f) | 0x80);
    body.push(...digits);
  }
  return der(0x06, body);
}
const name = (common: string) =>
  sequence(
    der(
      0x31,
      sequence(oid('2.5.4.3'), der(0x0c, new TextEncoder().encode(common))),
    ),
  );
function time(date: Date) {
  const text = date.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
  const year = date.getUTCFullYear();
  return year >= 1950 && year < 2050
    ? der(0x17, new TextEncoder().encode(text.slice(2)))
    : der(0x18, new TextEncoder().encode(text));
}
const extension = (id: string, value: Uint8Array) =>
  sequence(oid(id), der(0x04, value));

/** WebCrypto signs in raw r||s; X.509 carries a DER ECDSA-Sig-Value. */
function derSignature(raw: ArrayBuffer) {
  const bytes = new Uint8Array(raw);
  const half = bytes.length / 2;
  return sequence(
    integer(bytes.subarray(0, half)),
    integer(bytes.subarray(half)),
  );
}
const generate = (namedCurve: 'P-256' | 'P-384') =>
  crypto.subtle.generateKey({ name: 'ECDSA', namedCurve }, true, [
    'sign',
    'verify',
  ]) as Promise<CryptoKeyPair>;

type Authority = {
  keys: CryptoKeyPair;
  name: Uint8Array;
  curve: 'P-256' | 'P-384';
};
async function issue(
  subject: string,
  curve: 'P-256' | 'P-384',
  issuer: Authority | 'self',
  options: {
    extensions: Uint8Array[];
    notBefore: Date;
    notAfter: Date;
    serial: number;
  },
) {
  const keys = await generate(curve);
  const signer: Authority =
    issuer === 'self' ? { keys, name: name(subject), curve } : issuer;
  const hash = signer.curve === 'P-384' ? 'SHA-384' : 'SHA-256';
  const algorithm = sequence(
    oid(hash === 'SHA-384' ? '1.2.840.10045.4.3.3' : '1.2.840.10045.4.3.2'),
  );
  const tbs = sequence(
    der(0xa0, integer(new Uint8Array([2]))),
    integer(new Uint8Array([options.serial])),
    algorithm,
    signer.name,
    sequence(time(options.notBefore), time(options.notAfter)),
    name(subject),
    new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey)),
    der(0xa3, sequence(...options.extensions)),
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash },
    signer.keys.privateKey,
    tbs,
  );
  const certificate = sequence(
    tbs,
    algorithm,
    der(0x03, [0], derSignature(signature)),
  );
  return { certificate, authority: { keys, name: name(subject), curve } };
}

const authority = extension('2.5.29.19', sequence(der(0x01, [0xff])));
const marker = (id: string) => extension(id, der(0x05));
const base64url = (value: unknown) =>
  Buffer.from(
    typeof value === 'string' ? value : JSON.stringify(value),
  ).toString('base64url');
const hex = async (data: Bytes) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', data)).toString('hex');

export type ChainOptions = {
  leafMarker?: boolean;
  intermediateMarker?: boolean;
  intermediateAuthority?: boolean;
  notBefore?: Date;
  notAfter?: Date;
};
export type TestChain = Awaited<ReturnType<typeof createTestChain>>;

/** Root and intermediate on P-384 and a P-256 leaf, with Apple's marker OIDs. */
export async function createTestChain(options: ChainOptions = {}) {
  const validity = {
    notBefore: options.notBefore ?? new Date(Date.now() - 86_400_000),
    notAfter: options.notAfter ?? new Date(Date.now() + 365 * 86_400_000),
  };
  const root = await issue('JustGO Test Root', 'P-384', 'self', {
    ...validity,
    serial: 1,
    extensions: [authority],
  });
  const intermediate = await issue(
    'JustGO Test Intermediate',
    'P-384',
    root.authority,
    {
      ...validity,
      serial: 2,
      extensions: [
        ...(options.intermediateAuthority === false ? [] : [authority]),
        ...(options.intermediateMarker === false
          ? []
          : [marker('1.2.840.113635.100.6.2.1')]),
      ],
    },
  );
  const leaf = await issue(
    'JustGO Test Leaf',
    'P-256',
    intermediate.authority,
    {
      ...validity,
      serial: 3,
      extensions:
        options.leafMarker === false
          ? []
          : [marker('1.2.840.113635.100.6.11.1')],
    },
  );
  const x5c = [leaf, intermediate, root].map(({ certificate }) =>
    Buffer.from(certificate).toString('base64'),
  );
  return {
    rootFingerprint: await hex(root.certificate),
    /** Sign like the App Store; `forge` signs with a key the leaf does not hold. */
    async sign(payload: object, forge = false) {
      const input = `${base64url({ alg: 'ES256', x5c })}.${base64url(payload)}`;
      const key = forge
        ? (await generate('P-256')).privateKey
        : leaf.authority.keys.privateKey;
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        new TextEncoder().encode(input),
      );
      return `${input}.${Buffer.from(signature).toString('base64url')}`;
    },
  };
}

export const testBilling = {
  keyId: 'TESTKEY123',
  issuerId: '57246542-96fe-1a63-e053-0824d011072a',
  bundleId: 'app.justgo.test',
  environment: 'Sandbox' as const,
};
export function transactionPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const now = Date.now();
  return {
    transactionId: '2000000000000001',
    originalTransactionId: '2000000000000001',
    bundleId: testBilling.bundleId,
    productId: 'app.justgo.monthly',
    type: 'Auto-Renewable Subscription',
    environment: testBilling.environment,
    purchaseDate: now - 60_000,
    expiresDate: now + 30 * 86_400_000,
    signedDate: now,
    ...overrides,
  };
}

/** A fresh App Store Connect key, as the PKCS8 PEM the config holds. */
export async function createConnectKey() {
  const keys = await generate('P-256');
  const pkcs8 = Buffer.from(
    await crypto.subtle.exportKey('pkcs8', keys.privateKey),
  ).toString('base64');
  return {
    publicKey: keys.publicKey,
    pem: `-----BEGIN PRIVATE KEY-----\n${pkcs8.replace(/.{64}/g, '$&\n')}\n-----END PRIVATE KEY-----`,
  };
}

export type StoreRequest = {
  url: string;
  redirect: RequestRedirect | undefined;
  claims: Record<string, unknown>;
  header: Record<string, unknown>;
};
/**
 * Get Transaction Info at the sandbox origin. It answers only a bearer the
 * connect key signed, and 404 for a transaction it does not hold.
 */
export function createTestStore(
  chain: TestChain,
  publicKey: CryptoKey,
  transactions: Map<string, Record<string, unknown>>,
  options: { forge?: boolean } = {},
) {
  const requests: StoreRequest[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    const [header = '', claims = '', signature = ''] = authorization
      .replace(/^Bearer /, '')
      .split('.');
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    if (!valid) return new Response('{}', { status: 401 });
    requests.push({
      url,
      redirect: init?.redirect,
      header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
      claims: JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')),
    });
    const match =
      /^https:\/\/api\.storekit-sandbox\.itunes\.apple\.com\/inApps\/v1\/transactions\/(\d+)$/.exec(
        url,
      );
    const payload = match?.[1] ? transactions.get(match[1]) : undefined;
    if (!payload) return new Response('{"errorCode":4040010}', { status: 404 });
    return Response.json({
      signedTransactionInfo: await chain.sign(payload, options.forge),
    });
  };
  return { transport, requests };
}
