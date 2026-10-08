import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  normalizeReflectionText,
  type Attempt,
  type PatchAttempt,
} from '@justgo/contracts';
import { IdentityError, type IdentityService } from '../identity/service.js';
import { projectAttempt, readAttempt } from './model.js';
export class ReflectionConflict extends IdentityError {
  constructor(readonly currentAttempt: Attempt) {
    super('REFLECTION_CONFLICT', 409);
  }
}
export class AttemptPatchService {
  constructor(private readonly identity: IdentityService) {}
  patch(token: string, id: string, input: PatchAttempt) {
    return this.identity.withSession(token, async (tx, session) => {
      const row = await readAttempt(tx, session.userId, id);
      if (!row) throw new IdentityError('NOT_FOUND', 404);
      const normalized = {
        expectedReflectionRevision: input.expectedReflectionRevision,
        reflection: {
          ...(input.reflection.feeling === undefined
            ? {}
            : { feeling: input.reflection.feeling }),
          ...(input.reflection.text === undefined
            ? {}
            : { text: normalizeReflectionText(input.reflection.text) }),
        },
      };
      const digest = createHash('sha256')
        .update(JSON.stringify(normalized))
        .digest('hex');
      const receipt = (
        await tx.execute<{
          attempt_id: string;
          input_digest: string;
          applied_revision: number;
        }>(
          sql`select attempt_id,input_digest,applied_revision from justgo.attempt_patch_receipts where user_id=${session.userId} and id=${input.submissionId}`,
        )
      ).rows[0];
      if (receipt) {
        if (receipt.attempt_id !== id || receipt.input_digest !== digest)
          throw new IdentityError('CONFLICT', 409);
        return {
          attempt: projectAttempt(row),
          acknowledgement: {
            submissionId: input.submissionId,
            appliedRevision: receipt.applied_revision,
          },
        };
      }
      if (row.reflection_revision !== input.expectedReflectionRevision)
        throw new ReflectionConflict(projectAttempt(row));
      if (
        row.reflection_revision > 0 &&
        (input.reflection.feeling !== undefined ||
          input.reflection.text === undefined)
      )
        throw new IdentityError('INVALID_REQUEST', 400);
      const feeling =
        row.reflection_revision === 0
          ? (input.reflection.feeling ?? null)
          : row.reflection_feeling;
      const text = normalizeReflectionText(input.reflection.text);
      if (feeling === null && text === null)
        throw new IdentityError('INVALID_REQUEST', 400);
      const appliedRevision = row.reflection_revision + 1;
      await tx.execute(
        sql`update justgo.attempts set reflection_feeling=${feeling},reflection_text=${text},reflection_revision=${appliedRevision} where user_id=${session.userId} and id=${id}`,
      );
      await tx.execute(
        sql`insert into justgo.attempt_patch_receipts(user_id,id,attempt_id,input_digest,applied_revision) values(${session.userId},${input.submissionId},${id},${digest},${appliedRevision})`,
      );
      return {
        attempt: projectAttempt((await readAttempt(tx, session.userId, id))!),
        acknowledgement: { submissionId: input.submissionId, appliedRevision },
      };
    });
  }
}
