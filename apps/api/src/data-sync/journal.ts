import { sql } from 'drizzle-orm';
import {
  journalSyncVersionSchema,
  normalizeReflectionText,
  sameHistoricalContext,
  type CompletionAttempt,
  type JournalSyncVersion,
  type JournalSyncRequest,
} from '@justgo/contracts';
import type { IdentityService } from '../identity/service.js';
import { ApiError } from '../http/api-error.js';
import { projectCompletion, readAttempt, type Tx } from '../attempts/model.js';
import {
  readDataEpoch,
  requireDataEpoch,
  rejectDeletedCompletion,
} from './epoch.js';
import { validateHistoricalContext } from './context.js';
type VersionRow = Record<string, unknown> & {
  version_id: string;
  attempt_id: string;
  parents: string[];
  feeling_scale_version: 1;
  reflection: JournalSyncVersion['reflection'];
  context: CompletionAttempt | null;
};
const columns = sql`version_id,attempt_id,parents,feeling_scale_version,reflection,context`;
async function project(
  tx: Tx,
  userId: string,
  row: VersionRow,
): Promise<JournalSyncVersion> {
  let context = row.context;
  if (!context) {
    const attempt = await readAttempt(tx, userId, row.attempt_id);
    if (!attempt) throw new ApiError('UNAVAILABLE', 503);
    context = projectCompletion(attempt);
  }
  return journalSyncVersionSchema.parse({
    versionId: row.version_id,
    attemptId: row.attempt_id,
    parents: row.parents,
    feelingScaleVersion: row.feeling_scale_version,
    reflection: row.reflection,
    context,
  });
}
const canonical = (version: JournalSyncVersion) => ({
  ...version,
  parents: [...version.parents].sort(),
  reflection: {
    ...version.reflection,
    text: normalizeReflectionText(version.reflection.text),
  },
});
function sameVersion(left: JournalSyncVersion, right: JournalSyncVersion) {
  const { context: leftContext, ...leftContent } = canonical(left),
    { context: rightContext, ...rightContent } = canonical(right);
  return Boolean(
    leftContext &&
    rightContext &&
    sameHistoricalContext(leftContext, rightContext) &&
    leftContext.instruction === rightContext.instruction &&
    JSON.stringify(leftContent) === JSON.stringify(rightContent),
  );
}
export class JournalSyncService {
  constructor(private readonly identity: IdentityService) {}
  save(token: string, input: JournalSyncRequest) {
    return this.identity.withSession(token, async (tx, session) => {
      if (!session.authUserId) throw new ApiError('UNAUTHORIZED');
      const dataEpoch = await requireDataEpoch(
        tx,
        session.userId,
        input.expectedEpoch,
      );
      if (
        new Set(input.versions.map((version) => version.versionId)).size !==
        input.versions.length
      )
        throw new ApiError('INVALID_REQUEST', 400);
      let saved = 0;
      const versions: JournalSyncVersion[] = [];
      for (const raw of input.versions) {
        if (!input.restoreDeleted)
          await rejectDeletedCompletion(
            tx,
            session.userId,
            raw.attemptId,
            true,
          );
        const old = (
          await tx.execute<VersionRow>(
            sql`select ${columns} from justgo.journal_versions where user_id=${session.userId} and version_id=${raw.versionId}`,
          )
        ).rows[0];
        const oldVersion = old
          ? await project(tx, session.userId, old)
          : undefined;
        const attempt = await readAttempt(tx, session.userId, raw.attemptId);
        const completion = attempt ? projectCompletion(attempt) : undefined;
        const context = raw.context ?? oldVersion?.context ?? completion;
        if (!context) throw new ApiError('INVALID_REQUEST', 400);
        validateHistoricalContext(context, Date.now());
        if (completion && !sameHistoricalContext(completion, context))
          throw new ApiError('CONFLICT', 409);
        const version = canonical(
          journalSyncVersionSchema.parse({ ...raw, context }),
        );
        if (oldVersion) {
          if (!sameVersion(oldVersion, version))
            throw new ApiError('CONFLICT', 409);
          versions.push(oldVersion);
          continue;
        }
        const previous = (
          await tx.execute<{ context: CompletionAttempt }>(
            sql`select context from justgo.journal_versions where user_id=${session.userId} and attempt_id=${version.attemptId} and context is not null order by version_id limit 1`,
          )
        ).rows[0];
        if (previous && !sameHistoricalContext(previous.context, context))
          throw new ApiError('CONFLICT', 409);
        if (!completion) {
          const card = (
            await tx.execute(
              sql`select c.id from justgo.challenges c where c.id=${context.challengeId} and c.level_id=${context.levelId} and exists(select 1 from justgo.venue_cards v where v.challenge_id=c.id and v.venue_id=${context.venue})`,
            )
          ).rows[0];
          if (!card) throw new ApiError('INVALID_REQUEST', 400);
        }
        for (const parent of version.parents) {
          if (
            !(
              await tx.execute(
                sql`select version_id from justgo.journal_versions where user_id=${session.userId} and version_id=${parent} and attempt_id=${version.attemptId}`,
              )
            ).rows[0]
          )
            throw new ApiError('INVALID_REQUEST', 400);
        }
        // A batch shares one budget entry; immutable-version replays need no new write budget.
        if (saved === 0)
          await this.identity.rateLimitAccount(tx, session.userId, 'write');
        await tx.execute(
          sql`insert into justgo.journal_versions(user_id,version_id,attempt_id,parents,feeling_scale_version,reflection,context) values(${session.userId},${version.versionId},${version.attemptId},${sql.param(version.parents)}::uuid[],${version.feelingScaleVersion},${JSON.stringify(version.reflection)}::jsonb,${JSON.stringify(context)}::jsonb)`,
        );
        versions.push(version);
        saved++;
      }
      return { dataEpoch, versions, saved, identical: versions.length - saved };
    });
  }
  page(token: string, cursor: string | undefined, limit: number) {
    return this.identity.withSession(token, async (tx, session) => {
      if (!session.authUserId) throw new ApiError('UNAUTHORIZED');
      await this.identity.rateLimitAccount(tx, session.userId, 'export');
      const rows = (
        await tx.execute<VersionRow>(
          sql`select ${columns} from justgo.journal_versions where user_id=${session.userId} ${cursor ? sql`and version_id>${cursor}::uuid` : sql``} order by version_id limit ${limit + 1}`,
        )
      ).rows;
      const versions: JournalSyncVersion[] = [];
      for (const row of rows.slice(0, limit))
        versions.push(await project(tx, session.userId, row));
      return {
        dataEpoch: await readDataEpoch(tx, session.userId),
        versions,
        nextCursor:
          rows.length > limit ? (rows[limit - 1]?.version_id ?? null) : null,
      };
    });
  }
}
