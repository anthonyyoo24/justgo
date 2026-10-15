import {
  exportPageSchema,
  type ExportPage,
  type Attempt,
} from '@justgo/contracts';
import { strToU8, zipSync } from 'fflate';
import type { AccountClient } from '../../../lib/account-client';
import { ApiError } from '../../../lib/http';
import {
  captureLocalExport,
  type LocalExportChange,
} from '../../../data/activity/export';
import type { AccountRepository } from '../../../data/activity/repository';

export type ExportArchive = { name: string; bytes: Uint8Array };
type ExportData = {
  formatVersion: 1;
  startedAt: string;
  exportedAt: string;
  account: ExportPage['account'];
  devices: ExportPage['devices'];
  preferences: { reduceMotion: boolean; haptics: boolean };
  attempts: Attempt[];
  localChanges: LocalExportChange[];
};

// Quotes/newlines are CSV-escaped; formula-looking text is inert in spreadsheets.
function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function createExportArchive(data: ExportData): ExportArchive {
  const columns = [
    'source',
    'attempt_id',
    'challenge_id',
    'challenge',
    'venue',
    'level',
    'started_at',
    'activity_date',
    'start_time_zone',
    'display_time_zone',
    'feeling',
    'reflection',
    'reflection_revision',
  ];
  const row = (attempt: Attempt, source: string) =>
    [
      source,
      attempt.id,
      attempt.challengeId,
      attempt.instruction,
      attempt.venue,
      attempt.levelId,
      attempt.startedAt,
      attempt.activityDate,
      attempt.startTimeZone,
      attempt.displayTimeZone,
      attempt.reflection?.feeling,
      attempt.reflection?.text,
      attempt.reflection?.revision,
    ]
      .map(csvCell)
      .join(',');
  const csv =
    '\uFEFF' +
    [
      columns.map(csvCell).join(','),
      ...data.attempts.map((attempt) => row(attempt, 'cloud')),
      ...data.localChanges.map((change) => row(change.attempt, change.status)),
    ].join('\r\n') +
    '\r\n';
  const readme = `JustGO data export\n\nThis ZIP contains private feelings and reflection text. Keep it somewhere safe.\n\nactivity.csv: completed challenges and saved reflections. source=cloud means saved online. pending_upload and needs_attention are local copies captured when export began. An edited challenge can have a cloud row and a local row with the same attempt_id; neither version is discarded.\n\ndata.json: account creation date, registered devices, this installation's Reduce motion and Haptics preferences, online attempts and local changes.\n\nOnline history is read in pages between startedAt and exportedAt; another device's changes during this period may appear between pages. Local changes are captured at startedAt and may finish uploading while the file is created. Export does not change or delete any data.\n\nCSV protects cells that could be treated as spreadsheet formulas with a leading apostrophe. JSON preserves the original text exactly, including Unicode and newlines. Recovery keys, session tokens, internal request diagnostics and unsaved input are excluded.\n`;
  return {
    name: `JustGO-data-${data.exportedAt.replace(/[:.]/g, '-')}.zip`,
    // Stored ZIP entries avoid heavy compression and work without native modules/workers.
    bytes: zipSync(
      {
        'activity.csv': strToU8(csv),
        'data.json': strToU8(JSON.stringify(data, null, 2)),
        'README.txt': strToU8(readme),
      },
      { level: 0 },
    ),
  };
}

export async function collectExport({
  client,
  repository,
  reduceMotion,
  haptics,
  signal,
}: {
  client: Pick<AccountClient, 'request' | 'ownsAccount'>;
  repository: Pick<AccountRepository, 'accountId' | 'hydrate' | 'store'>;
  reduceMotion: boolean;
  haptics: boolean;
  signal: AbortSignal;
}): Promise<ExportArchive> {
  const check = () => {
    if (signal.aborted) throw new ApiError('CANCELLED');
    if (!client.ownsAccount(repository.accountId))
      throw new ApiError('ACCOUNT_CHANGED');
  };
  check();
  await repository.hydrate();
  check();
  const startedAt = new Date().toISOString();
  const localChanges = captureLocalExport(repository.store.getState());
  const attempts: Attempt[] = [];
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let first: ExportPage | undefined;
  do {
    const page: ExportPage = await client.request(
      '/v1/account/export' +
        (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''),
      exportPageSchema,
      { signal },
    );
    check();
    if (page.account.id !== repository.accountId)
      throw new ApiError('ACCOUNT_CHANGED');
    first ??= page;
    for (const attempt of page.attempts) {
      if (ids.has(attempt.id)) throw new ApiError('UNAVAILABLE');
      ids.add(attempt.id);
      attempts.push(attempt);
    }
    cursor = page.nextCursor;
    if (cursor) {
      if (cursors.has(cursor) || cursor !== page.attempts.at(-1)?.id)
        throw new ApiError('UNAVAILABLE');
      cursors.add(cursor);
    }
  } while (cursor);
  check();
  return createExportArchive({
    formatVersion: 1,
    startedAt,
    exportedAt: new Date().toISOString(),
    account: first!.account,
    devices: first!.devices,
    preferences: { reduceMotion, haptics },
    attempts: attempts.sort(
      (a, b) =>
        a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
    ),
    localChanges,
  });
}
