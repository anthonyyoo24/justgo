// Sign an Apple-shaped JWS with the self-made test chain, then verify it with
// webcrypto-verify.mjs. Node is used only to read files and sign.
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import { verifySignedTransaction, pemToDer } from './webcrypto-verify.mjs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const b64 = (der) => Buffer.from(der).toString('base64');
const b64url = (s) => Buffer.from(s).toString('base64url');
const [leaf, inter, root, other] = ['leaf.pem', 'inter.pem', 'root.pem', 'other.pem'].map((f) => pemToDer(read(f)));
const key = createPrivateKey(read('leaf.key'));

function makeJws(payload, chain = [leaf, inter, root]) {
  const header = b64url(JSON.stringify({ alg: 'ES256', x5c: chain.map(b64) }));
  const body = b64url(JSON.stringify(payload));
  const sig = sign('sha256', Buffer.from(`${header}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${body}.${sig.toString('base64url')}`;
}
const payload = {
  transactionId: '2000000123456789', originalTransactionId: '2000000123456789',
  bundleId: 'dev.justgo.foundation', productId: 'com.anthonyyoo.justgo.pro.annual',
  appAccountToken: '7f1d6c2e-4b8a-4c7e-9a1f-2b3c4d5e6f70', environment: 'Sandbox',
  signedDate: Date.now(), type: 'Auto-Renewable Subscription',
};
const opts = { bundleId: 'dev.justgo.foundation', environment: 'Sandbox' };
const good = makeJws(payload);
const cases = {
  valid: [good, [root]],
  tamperedPayload: [good.split('.').map((p, i) => (i === 1 ? b64url(JSON.stringify({ ...payload, productId: 'x' })) : p)).join('.'), [root]],
  unpinnedRoot: [good, [other]],
  wrongBundle: [makeJws({ ...payload, bundleId: 'evil' }), [root]],
  chainSwappedRoot: [makeJws(payload, [leaf, inter, other]), [root, other]],
  leafAsIntermediate: [makeJws(payload, [leaf, leaf, root]), [root]],
};
for (const [name, [jws, roots]] of Object.entries(cases)) {
  try {
    const out = await verifySignedTransaction(jws, roots, opts);
    console.log(`${name}: ACCEPTED transactionId=${out.transactionId} appAccountToken=${out.appAccountToken}`);
  } catch (e) {
    console.log(`${name}: REJECTED ${e.message}`);
  }
}
