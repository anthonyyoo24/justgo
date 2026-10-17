import type { Attempt } from '@justgo/contracts';
import { ApiError } from '../../lib/network/http';
import type { JournalState } from './model';

export type LocalExportChange = {
  status: 'pending_upload' | 'needs_attention';
  attempt: Attempt;
};

/** Copy accepted local content; cached, acknowledged rows come from the server. */
export function captureLocalExport(state: JournalState): LocalExportChange[] {
  // Backgrounding pauses uploads; ownership is fenced by the account client.
  // A read-only export may continue while this app is behind the share sheet.
  if (!state.ready || state.hydrationError) throw new ApiError('STORAGE');
  return Object.values(state.journal.records)
    .filter(
      (record) => record.serverVersion < record.version || record.rejected,
    )
    .map((record) => ({
      status:
        record.rejected ||
        state.journal.operations.some(
          (op) => op.attemptId === record.attempt.id && op.state === 'rejected',
        )
          ? 'needs_attention'
          : 'pending_upload',
      attempt: JSON.parse(JSON.stringify(record.attempt)) as Attempt,
    }));
}
