// Phase 16 prototype Q5: verify an App Store signed transaction (JWS with an
// x5c chain) using only WebCrypto and a tiny DER reader. No Node built-ins,
// so the same module can run in Deno / Supabase Edge.

const OID_LEAF = '1.2.840.113635.100.6.11.1';
const OID_INTERMEDIATE = '1.2.840.113635.100.6.2.1';
const OID_EC_P256 = '1.2.840.10045.3.1.7';
const OID_EC_P384 = '1.3.132.0.34';
const OID_ECDSA_SHA256 = '1.2.840.10045.4.3.2';
const OID_ECDSA_SHA384 = '1.2.840.10045.4.3.3';
const OID_BASIC_CONSTRAINTS = '2.5.29.19';

function b64urlToBytes(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
function b64ToBytes(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** Read one DER TLV at `offset`. */
function tlv(bytes, offset) {
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let header = 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count < 1 || count > 4) throw new Error('DER_LENGTH');
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[offset + 2 + i];
    header += count;
  }
  const start = offset + header;
  const end = start + length;
  if (end > bytes.length) throw new Error('DER_TRUNCATED');
  return { tag, start, end, raw: bytes.subarray(offset, end), body: bytes.subarray(start, end) };
}
function children(bytes) {
  const out = [];
  for (let at = 0; at < bytes.length; ) {
    const node = tlv(bytes, at);
    out.push(node);
    at = node.end;
  }
  return out;
}
function oid(body) {
  const parts = [Math.floor(body[0] / 40), body[0] % 40];
  let value = 0;
  for (let i = 1; i < body.length; i++) {
    value = value * 128 + (body[i] & 0x7f);
    if (!(body[i] & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}
function time(node) {
  const text = new TextDecoder().decode(node.body);
  const full = node.tag === 0x17 ? (Number(text.slice(0, 2)) >= 50 ? '19' : '20') + text : text;
  return Date.UTC(+full.slice(0, 4), +full.slice(4, 6) - 1, +full.slice(6, 8), +full.slice(8, 10), +full.slice(10, 12), +full.slice(12, 14));
}

function parseCertificate(der) {
  const [cert] = children(der);
  const [tbs, sigAlg, sigValue] = children(cert.body);
  const fields = children(tbs.body);
  let i = fields[0].tag === 0xa0 ? 1 : 0;
  i += 1; // serial
  i += 1; // signature algorithm
  const issuer = fields[i++];
  const [notBefore, notAfter] = children(fields[i++].body);
  const subject = fields[i++];
  const spki = fields[i++];
  const extensions = new Map();
  for (const field of fields.slice(i)) {
    if (field.tag !== 0xa3) continue;
    for (const ext of children(children(field.body)[0].body)) {
      const parts = children(ext.body);
      extensions.set(oid(parts[0].body), parts[parts.length - 1].body);
    }
  }
  const [spkiAlg] = children(spki.body);
  const [, curve] = children(spkiAlg.body);
  return {
    tbs: tbs.raw,
    signatureAlgorithm: oid(children(sigAlg.body)[0].body),
    signature: sigValue.body.subarray(1), // drop unused-bits byte
    issuer: issuer.raw,
    subject: subject.raw,
    notBefore: time(notBefore),
    notAfter: time(notAfter),
    spki: spki.raw,
    curve: oid(curve.body),
    extensions,
  };
}

/** DER ECDSA-Sig-Value to the raw r||s form WebCrypto verifies. */
function derSignatureToRaw(der, size) {
  const [seq] = children(der);
  const [r, s] = children(seq.body);
  const out = new Uint8Array(size * 2);
  const fit = (int, at) => {
    const trimmed = int.body.subarray(Math.max(0, int.body.length - size));
    out.set(trimmed, at + size - trimmed.length);
  };
  fit(r, 0);
  fit(s, size);
  return out;
}

function curveParams(curve) {
  if (curve === OID_EC_P256) return { namedCurve: 'P-256', size: 32 };
  if (curve === OID_EC_P384) return { namedCurve: 'P-384', size: 48 };
  throw new Error('UNSUPPORTED_CURVE');
}
function hashFor(algorithm) {
  if (algorithm === OID_ECDSA_SHA256) return 'SHA-256';
  if (algorithm === OID_ECDSA_SHA384) return 'SHA-384';
  throw new Error('UNSUPPORTED_SIGNATURE_ALGORITHM');
}
async function importKey(cert) {
  const { namedCurve } = curveParams(cert.curve);
  return crypto.subtle.importKey('spki', cert.spki, { name: 'ECDSA', namedCurve }, false, ['verify']);
}
async function verifiedBy(child, parent) {
  if (!equal(child.issuer, parent.subject)) return false;
  const { namedCurve, size } = curveParams(parent.curve);
  const key = await importKey(parent);
  void namedCurve;
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: hashFor(child.signatureAlgorithm) },
    key,
    derSignatureToRaw(child.signature, size),
    child.tbs,
  );
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function isCA(cert) {
  const value = cert.extensions.get(OID_BASIC_CONSTRAINTS);
  if (!value) return false;
  const [seq] = children(value);
  const parts = children(seq.body);
  return parts.length > 0 && parts[0].tag === 0x01 && parts[0].body[0] === 0xff;
}

/**
 * Verify `jws` against the pinned root certificates (DER bytes). Returns the
 * decoded payload or throws. `at` is the time checked against each
 * certificate's validity (Apple's library uses signedDate when offline).
 */
export async function verifySignedTransaction(jws, pinnedRoots, { bundleId, environment } = {}) {
  const [headerPart, payloadPart, signaturePart, extra] = jws.split('.');
  if (!signaturePart || extra !== undefined) throw new Error('JWS_SHAPE');
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerPart)));
  if (header.alg !== 'ES256') throw new Error('JWS_ALG');
  if (!Array.isArray(header.x5c) || header.x5c.length !== 3) throw new Error('JWS_X5C');
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadPart)));
  const [leafDer, intermediateDer, rootDer] = header.x5c.map(b64ToBytes);
  if (!pinnedRoots.some((root) => equal(root, rootDer))) throw new Error('ROOT_NOT_PINNED');
  const [leaf, intermediate, root] = [leafDer, intermediateDer, rootDer].map(parseCertificate);
  const at = typeof payload.signedDate === 'number' ? payload.signedDate : Date.now();
  for (const cert of [leaf, intermediate, root])
    if (at < cert.notBefore || at > cert.notAfter) throw new Error('CERT_EXPIRED');
  if (!leaf.extensions.has(OID_LEAF)) throw new Error('LEAF_OID');
  if (!intermediate.extensions.has(OID_INTERMEDIATE)) throw new Error('INTERMEDIATE_OID');
  if (!isCA(intermediate) || !isCA(root)) throw new Error('NOT_CA');
  if (!(await verifiedBy(root, root))) throw new Error('ROOT_SIGNATURE');
  if (!(await verifiedBy(intermediate, root))) throw new Error('INTERMEDIATE_SIGNATURE');
  if (!(await verifiedBy(leaf, intermediate))) throw new Error('LEAF_SIGNATURE');
  if (leaf.curve !== OID_EC_P256) throw new Error('LEAF_CURVE');
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    await importKey(leaf),
    b64urlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) throw new Error('JWS_SIGNATURE');
  if (bundleId && payload.bundleId !== bundleId) throw new Error('BUNDLE_ID');
  if (environment && payload.environment !== environment) throw new Error('ENVIRONMENT');
  return payload;
}

export function pemToDer(pem) {
  return b64ToBytes(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
}
