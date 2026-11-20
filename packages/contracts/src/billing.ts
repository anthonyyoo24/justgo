import { z } from 'zod';

/** The phone names an App Store transaction. The server asks Apple for its contents. */
export const billingVerificationRequestSchema = z
  .object({ transactionId: z.string().regex(/^[0-9]{1,32}$/) })
  .strict();
export type BillingVerificationRequest = z.infer<
  typeof billingVerificationRequestSchema
>;
