import { createHostedTrialHandler } from './dist/edge.mjs';

const handler = createHostedTrialHandler(Deno.env.toObject());

Deno.serve((request) => handler.fetch(request));
