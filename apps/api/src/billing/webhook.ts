import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  billingEventResponseSchema,
  superwallEventSchema,
  type BillingEventResponse,
} from '@justgo/contracts';
import type { ApiApp } from '../http/request.js';
import {
  parseRequestJson,
  readRequestText,
  requestFailure,
} from '../http/request.js';
import { ApiError } from '../http/api-error.js';
import type { IdentityService } from '../identity/service.js';
import { setTransactionContext } from '../db/transaction-context.js';
import type { AppleSubscriptionReader, VerifiedTransaction } from './apple.js';
import { newestAnswer } from './newest-answer.js';

/** Svix refuses a message more than five minutes from its send time. */
const tolerance = 300;
const eventLimit = 32 * 1024;
const transactionId = /^[0-9]{1,32}$/;

const refused = () => new ApiError('INVALID_REQUEST', 400);

/**
 * Check a Svix delivery: the message ID, a send time inside the tolerance
 * window and at least one v1 HMAC-SHA256 signature over `id.timestamp.body`
 * made with the endpoint secret. Answers the message ID, or throws 400.
 */
export function verifySvix(
  secret: string,
  headers: {
    id: string | undefined;
    timestamp: string | undefined;
    signature: string | undefined;
  },
  body: string,
  now: number,
): string {
  const { id, timestamp, signature } = headers;
  if (
    !id ||
    !/^[A-Za-z0-9_.:-]{1,255}$/.test(id) ||
    !timestamp ||
    !/^[0-9]{1,12}$/.test(timestamp) ||
    !signature ||
    signature.length > 4096
  )
    throw refused();
  if (Math.abs(now / 1000 - Number(timestamp)) > tolerance) throw refused();
  const expected = createHmac(
    'sha256',
    Buffer.from(secret.replace(/^whsec_/, ''), 'base64'),
  )
    .update(`${id}.${timestamp}.${body}`)
    .digest();
  const signed = signature.split(' ').some((entry) => {
    const comma = entry.indexOf(',');
    if (comma < 0 || entry.slice(0, comma) !== 'v1') return false;
    const candidate = Buffer.from(entry.slice(comma + 1), 'base64');
    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  });
  if (!signed) throw refused();
  return id;
}

/**
 * Store what Apple just answered for one subscription, and mark every event
 * that named it confirmed. The setting that opens these rows is set only here,
 * after Apple's signed answer verified. It reaches a stored subscription only:
 * it never inserts one and never binds or moves an owner, so a webhook alone
 * can never create paid access. The newest Apple answer wins, as in the
 * verifier, so an answer committed late never undoes a newer one.
 */
export async function applyConfirmed(
  identity: IdentityService,
  purchase: VerifiedTransaction,
) {
  await identity.db.transaction(async (tx) => {
    await setTransactionContext(
      tx,
      'app.apple_confirmed_transaction_id',
      purchase.originalTransactionId,
    );
    await tx.execute(
      sql`update justgo.app_store_subscriptions set ${newestAnswer(purchase)}, checked_at=now() where original_transaction_id=${purchase.originalTransactionId}`,
    );
    await tx.execute(
      sql`update justgo.billing_events set confirmed_at=now() where original_transaction_id=${purchase.originalTransactionId} and confirmed_at is null`,
    );
  });
}

/**
 * Apple refused the ID as unknown or not this app's, so nothing will ever
 * confirm it. Close the event under its own verified Svix ID.
 */
async function closeEvent(identity: IdentityService, eventId: string) {
  await identity.db.transaction(async (tx) => {
    await setTransactionContext(tx, 'app.billing_event_id', eventId);
    await tx.execute(
      sql`update justgo.billing_events set confirmed_at=now() where event_id=${eventId} and confirmed_at is null`,
    );
  });
}

export class BillingEvents {
  constructor(
    private readonly identity: IdentityService,
    private readonly subscriptions: AppleSubscriptionReader,
  ) {}

  /**
   * Handle one event whose Svix signature already verified. The event is saved
   * once by its ID before Apple is asked, and is marked confirmed only after
   * Apple's answer is stored, so a failure leaves it pending for Superwall's
   * retry and the repair job.
   */
  async receive(eventId: string, body: string): Promise<BillingEventResponse> {
    const event = superwallEventSchema.safeParse(parseRequestJson(body));
    const named =
      event.success && event.data.data.store === 'APP_STORE'
        ? event.data.data.originalTransactionId
        : undefined;
    const originalId =
      named !== undefined && transactionId.test(named) ? named : null;
    const [saved] = await this.identity.db.transaction(async (tx) => {
      await setTransactionContext(tx, 'app.billing_event_id', eventId);
      // Nothing to ask Apple about, such as a Play Store or test event.
      await tx.execute(
        originalId === null
          ? sql`insert into justgo.billing_events (event_id,confirmed_at) values (${eventId},now()) on conflict (event_id) do nothing`
          : sql`insert into justgo.billing_events (event_id,original_transaction_id) values (${eventId},${originalId}) on conflict (event_id) do nothing`,
      );
      return (
        await tx.execute<{ confirmed_at: Date | string | null }>(
          sql`select confirmed_at from justgo.billing_events where event_id=${eventId}`,
        )
      ).rows;
    });
    if (!saved) throw new Error('Billing event was not saved');
    if (originalId === null) return { status: 'ignored' };
    if (saved.confirmed_at !== null) return { status: 'duplicate' };
    let purchase: VerifiedTransaction;
    try {
      // Apple I/O runs here, with no transaction open.
      purchase = await this.subscriptions(originalId);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 400 || error.status === 404)
      ) {
        await closeEvent(this.identity, eventId);
        return { status: 'ignored' };
      }
      throw error;
    }
    await applyConfirmed(this.identity, purchase);
    return { status: 'confirmed' };
  }
}

export function billingEventRoutes(
  app: ApiApp,
  identity: IdentityService,
  options: {
    subscriptions: AppleSubscriptionReader;
    webhookSecret: string;
  },
) {
  const events = new BillingEvents(identity, options.subscriptions);
  app.post('/superwall-events', async (context) => {
    await identity.rateLimit(
      context.get('clientAddress'),
      'billing-events',
      3000,
    );
    const read = await readRequestText(context, eventLimit);
    if (!read) throw requestFailure(400);
    if (read.type !== 'application/json') throw requestFailure(415);
    // The signature is checked before the body is parsed or anything is saved.
    const eventId = verifySvix(
      options.webhookSecret,
      {
        id: context.req.header('svix-id'),
        timestamp: context.req.header('svix-timestamp'),
        signature: context.req.header('svix-signature'),
      },
      read.text,
      Date.now(),
    );
    return context.json(
      billingEventResponseSchema.parse(
        await events.receive(eventId, read.text),
      ),
    );
  });
}
