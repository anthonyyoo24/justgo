import { ApiError } from '../http/api-error.js';

/** Retired before parsing any private input. Legacy retries must stop. */
export function rejectPrivateJournalWrite(): never {
  throw new ApiError('PRIVATE_JOURNAL_LOCAL', 410);
}
