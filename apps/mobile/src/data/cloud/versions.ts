import type { Attempt, JournalSyncVersion } from '@justgo/contracts';
import { journalEntry } from '../activity/private-journal';
import type { LocalJournalEntry } from '../journal/model';
import { ApiError } from '../../lib/network/http';

export function versionEntry(
  owner: string,
  version: JournalSyncVersion,
  attempts: ReadonlyMap<string, Attempt>,
): LocalJournalEntry {
  const attempt = version.context ?? attempts.get(version.attemptId);
  if (!attempt || attempt.id !== version.attemptId)
    throw new ApiError('INVALID_RESPONSE');
  return journalEntry(owner, { ...attempt, reflection: version.reflection });
}
export function versionHeads(
  versions: JournalSyncVersion[],
): Map<string, JournalSyncVersion[]> {
  const superseded = new Set(versions.flatMap((version) => version.parents));
  const result = new Map<string, JournalSyncVersion[]>();
  for (const version of versions) {
    if (superseded.has(version.versionId)) continue;
    const heads = result.get(version.attemptId) ?? [];
    heads.push(version);
    result.set(version.attemptId, heads);
  }
  for (const heads of result.values())
    heads.sort((a, b) => a.versionId.localeCompare(b.versionId));
  return result;
}
export function isAncestor(
  ancestor: string,
  descendant: JournalSyncVersion,
  versions: ReadonlyMap<string, JournalSyncVersion>,
): boolean {
  const queue = [...descendant.parents];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.pop()!;
    if (id === ancestor) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(versions.get(id)?.parents ?? []));
  }
  return false;
}
