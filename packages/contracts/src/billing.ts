import { z } from 'zod';

/** The phone names an App Store transaction. The server asks Apple for its contents. */
export const billingVerificationRequestSchema = z
  .object({ transactionId: z.string().regex(/^[0-9]{1,32}$/) })
  .strict();
export type BillingVerificationRequest = z.infer<
  typeof billingVerificationRequestSchema
>;

/**
 * The parts of a Superwall webhook event the server reads. The server checks
 * the Svix signature first and then asks Apple, so these fields only say which
 * subscription to ask about and never grant access.
 */
export const superwallEventSchema = z.looseObject({
  type: z.string().max(255),
  data: z.looseObject({
    originalTransactionId: z.string().max(255).optional(),
    store: z.string().max(255).optional(),
  }),
});
export const billingEventResponseSchema = z
  .object({ status: z.enum(['confirmed', 'duplicate', 'ignored']) })
  .strict();
export type BillingEventResponse = z.infer<typeof billingEventResponseSchema>;
export const billingRepairResponseSchema = z
  .object({
    checked: z.number().int().min(0),
    failed: z.number().int().min(0),
    remaining: z.boolean(),
  })
  .strict();
export type BillingRepairResponse = z.infer<typeof billingRepairResponseSchema>;
