import { createEdgeHandler } from './dist/edge.mjs';

const handler = createEdgeHandler(Deno.env.toObject());

Deno.serve((request) => handler.fetch(request));
