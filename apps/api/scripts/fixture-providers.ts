// Imported only by the guarded disposable loopback server, never by src/server.
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type {
  ManagedAuthVerifier,
  VerifiedManagedIdentity,
} from '../src/identity/managed-verifier.js';
import type { ManagedLiveSessionReader } from '../src/identity/managed-service.js';
import type { ManagedAuthDeletion } from '../src/identity/managed-deletion.js';
import { ApiError } from '../src/http/api-error.js';
import { parse } from '../src/http/parse.js';
const providerSchema = z.enum(['apple', 'google']);
const sessionRequest = z
  .object({
    provider: providerSchema,
    subjectHandle: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
  })
  .strict();
const linkRequest = z
  .object({
    provider: providerSchema,
    accessToken: z.string().min(1).max(1000),
  })
  .strict();
const signOutRequest = z
  .object({ accessToken: z.string().min(1).max(1000) })
  .strict();
type Subject = {
  handle: string;
  id: string;
  providers: Set<'apple' | 'google'>;
  deleted: boolean;
};
type Session = {
  id: string;
  subject: Subject;
  accessToken: string;
  expiresAt: string;
  live: boolean;
};
export class FixtureProviders {
  private readonly subjects = new Map<string, Subject>();
  private readonly sessions = new Map<string, Session>();
  private view(session: Session) {
    return {
      subjectHandle: session.subject.handle,
      session: {
        authUserId: session.subject.id,
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
        linkedProviders: [...session.subject.providers],
      },
    };
  }
  create(value: unknown) {
    const input = parse(sessionRequest, value);
    let subject = input.subjectHandle
      ? this.subjects.get(input.subjectHandle)
      : undefined;
    if (input.subjectHandle && !subject)
      throw new ApiError('INVALID_REQUEST', 400);
    if (!subject || subject.deleted) {
      const handle = subject?.handle ?? randomBytes(16).toString('hex');
      subject = {
        handle,
        id: randomUUID(),
        providers: new Set(),
        deleted: false,
      };
      this.subjects.set(handle, subject);
    }
    subject.providers.add(input.provider);
    const session: Session = {
      id: randomUUID(),
      subject,
      accessToken: `fixture.${randomBytes(32).toString('base64url')}.proof`,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      live: true,
    };
    this.sessions.set(session.accessToken, session);
    return this.view(session);
  }
  link(value: unknown) {
    const input = parse(linkRequest, value),
      session = this.sessions.get(input.accessToken);
    if (!session || !session.live || session.subject.deleted)
      throw new ApiError('UNAUTHORIZED');
    session.subject.providers.add(input.provider);
    return this.view(session);
  }
  unlink(value: unknown) {
    const input = parse(linkRequest, value),
      session = this.sessions.get(input.accessToken);
    if (
      !session ||
      !session.live ||
      session.subject.deleted ||
      Date.parse(session.expiresAt) <= Date.now()
    )
      throw new ApiError('UNAUTHORIZED');
    if (!session.subject.providers.has(input.provider))
      return this.view(session);
    if (session.subject.providers.size < 2)
      throw new ApiError('INVALID_REQUEST', 409);
    session.subject.providers.delete(input.provider);
    return this.view(session);
  }
  signOut(value: unknown) {
    const input = parse(signOutRequest, value),
      session = this.sessions.get(input.accessToken);
    if (!session) throw new ApiError('INVALID_REQUEST', 400);
    session.live = false;
    return { ok: true as const };
  }
  readonly verify: ManagedAuthVerifier = async (token) => {
    const session = this.sessions.get(token);
    if (
      !session ||
      session.subject.deleted ||
      Date.parse(session.expiresAt) <= Date.now()
    )
      throw new ApiError('UNAUTHORIZED');
    return {
      authUserId: session.subject.id,
      sessionId: session.id,
      expiresAt: session.expiresAt,
    };
  };
  readonly live: ManagedLiveSessionReader = async (
    _tx,
    identity: VerifiedManagedIdentity,
  ) =>
    [...this.sessions.values()].some(
      (session) =>
        session.id === identity.sessionId &&
        session.subject.id === identity.authUserId &&
        session.live &&
        !session.subject.deleted,
    );
  readonly erase: ManagedAuthDeletion = async (authUserId) => {
    const sessions = [...this.sessions.values()].filter(
      (session) => session.subject.id === authUserId,
    );
    if (!sessions.length) throw new ApiError('UNAVAILABLE', 503);
    for (const session of sessions) {
      session.subject.deleted = true;
      session.live = false;
    }
  };
}
export function fixtureProviderRoutes(
  app: FastifyInstance,
  providers: FixtureProviders,
) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError)
      return reply.code(error.status).send(error.response(request.id));
    return reply
      .code(400)
      .send({ code: 'INVALID_REQUEST', requestId: request.id });
  });
  app.post('/provider-sessions', async (request) =>
    providers.create(request.body),
  );
  app.post('/provider-links', async (request) => providers.link(request.body));
  app.post('/provider-unlinks', async (request) =>
    providers.unlink(request.body),
  );
  app.post('/provider-sign-outs', async (request) =>
    providers.signOut(request.body),
  );
}
