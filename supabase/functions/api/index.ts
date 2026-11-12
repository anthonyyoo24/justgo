// The Edge Function entry. `pnpm run build:edge` writes ./dist from the API
// source, so this file only hands the runtime environment to the bundle.
import { createEdgeHandler } from './dist/edge.mjs';
import { release } from './dist/release.mjs';

type EdgeRuntimeGlobal = {
  EdgeRuntime?: { waitUntil(work: Promise<unknown>): void };
};

const runtime = (globalThis as EdgeRuntimeGlobal).EdgeRuntime;
const handler = createEdgeHandler(Deno.env.toObject(), {
  release,
  ...(runtime ? { waitUntil: (work) => runtime.waitUntil(work) } : {}),
});

Deno.serve((request) => handler.fetch(request));
