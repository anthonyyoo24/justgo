import type { ClientBase } from 'pg';

export const ledgerTables: Readonly<Record<string, string>>;
export function captureLedger(
  client: ClientBase,
  metadata: Readonly<Record<string, string>>,
): Promise<string>;
