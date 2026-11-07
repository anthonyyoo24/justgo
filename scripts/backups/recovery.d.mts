import type { ClientBase } from 'pg';

export function reconcileLedger(
  client: ClientBase,
  ledger: unknown,
): Promise<{
  reconciled: true;
  writersMayOpen: false;
  providerAcceptanceRequired: true;
}>;
