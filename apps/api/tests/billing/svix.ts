import { createHmac, randomBytes, randomUUID } from 'node:crypto';

/** A self-made Svix endpoint secret. Nothing here talks to Superwall. */
export const testWebhookSecret = () =>
  `whsec_${randomBytes(24).toString('base64')}`;

/** Sign a body the way Svix delivers a Superwall webhook. */
export function svixHeaders(
  secret: string,
  body: string,
  options: { id?: string; timestamp?: number } = {},
) {
  const id = options.id ?? `msg_${randomUUID().replaceAll('-', '')}`;
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = createHmac(
    'sha256',
    Buffer.from(secret.replace(/^whsec_/, ''), 'base64'),
  )
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`,
  };
}

/** A Superwall event body that names one App Store subscription. */
export const superwallEvent = (
  type: string,
  originalTransactionId: string,
  data: Record<string, unknown> = {},
) =>
  JSON.stringify({
    object: 'event',
    type,
    projectId: 1,
    applicationId: 1,
    timestamp: Date.now(),
    data: {
      id: randomUUID(),
      name: type,
      store: 'APP_STORE',
      environment: 'SANDBOX',
      originalTransactionId,
      transactionId: originalTransactionId,
      productId: 'app.justgo.monthly',
      ...data,
    },
  });
