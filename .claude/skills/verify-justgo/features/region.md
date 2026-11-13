# API region pin

Every request the app's API client sends carries `x-region: ca-central-1`, so
Supabase runs the `api` function beside the `ca-central-1` database
([#449](https://github.com/anthonyyoo24/justgo/issues/449)). The user sees
nothing. The proof is the request headers and a cross-origin web build whose
CORS preflights accept the header.

## Sub-features

- Sign-in, the first sync, access and catalog reads carry the header.
- Completion and journal uploads carry the header.
- The web build's CORS preflight from `127.0.0.1:8081` to the API accepts it.

## How to get to it (user POV)

Sign in on Welcome, accept a card, complete it and save a reflection.

## Driving it with Playwright

Run `bin/verify drive region`, with `JUSTGO_JOURNEY_API_PREFIX=/functions/v1/api`
to match the hosted base path. The drive records every app request under
`/v1/`, skipping the harness's `/__fixtures/` sign-in seam. It fails on a
request without the header and on any failed request, which is how a refused
preflight shows. `proof.json` lists the request count, the requests without the
header, the failed requests and the distinct paths.

## Gotchas

- The base path itself contains `/v1/`, so match API routes, not the prefix.
- Playwright does not show preflight requests. A cross-origin request that
  completes is the evidence that its preflight passed.
- Web cannot prove the hosted gateway honors the header. P15-2 lane 7 read
  `x-sb-edge-region` on staging for that.
