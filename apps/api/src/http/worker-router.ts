import type { Params, Result, Router } from 'hono/router';
import { TrieRouter } from 'hono/router/trie-router';

type Registration<T> = { handler: T };

function uniqueMatches<T>(matches: [Registration<T>, Params][]) {
  const seen = new Set<Registration<T>>();
  const unique: [T, Params][] = [];
  for (const [registration, params] of matches) {
    if (seen.has(registration)) continue;
    seen.add(registration);
    unique.push([registration.handler, params]);
  }
  return unique;
}

/** Match without compilation while running each registered handler only once. */
export class WorkerRouter<T> implements Router<T> {
  readonly name = 'WorkerRouter';
  private readonly trie = new TrieRouter<Registration<T>>();

  add(method: string, path: string, handler: T) {
    // A handler can be intentionally registered twice; identity belongs to the
    // registration rather than its function or payload.
    this.trie.add(method, path, { handler });
  }

  match(method: string, path: string): Result<T> {
    // Hono 4.13.14 can return one wildcard registration through both its exact
    // and pattern branches when the requested segment is literally '*'.
    // The pinned TrieRouter returns direct parameter maps, although its public
    // declaration shares the broader result union with other Hono routers.
    const result = this.trie.match(method, path) as [
      [Registration<T>, Params][],
    ];
    return [uniqueMatches(result[0])];
  }
}
