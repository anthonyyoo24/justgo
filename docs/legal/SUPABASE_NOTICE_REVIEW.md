# Supabase notice — published November 13, 2026

This review backs the Phase 15 Privacy Policy version
`2026-11-13-supabase-edge`, in
[PRIVACY_POLICY_DRAFT.md](PRIVACY_POLICY_DRAFT.md). The API moved from Vercel and
a Cloudflare Worker to the Supabase Edge Function `api`
([Supabase plan](../implementation-plan/phase-15-supabase-api.md), P15-10).
Anthony approved the text and its publication on November 13, 2026, and
[APPROVALS.md](APPROVALS.md) records both. It was published that day and replaced
`2026-10-27-essential-errors`, which named Vercel as the API host. Terms need no
hosting change.

The earlier Cloudflare notice candidate (git history keeps it) named Cloudflare as
the API, database-connection and legal-page host. Its R2 backup wording, which
Anthony approved on October 30, 2026, carries over unchanged. Its API, Hyperdrive
and legal-page clauses do not.

## What the notice changes

| Section                                        | Change                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| How we use information                         | New paragraph: Supabase runs the server, and its function logs record method, path, status and timing, never bodies, tokens or journal text, for a period the service plan sets. The Vercel paragraph stays. |
| Service providers and international processing | Supabase now also runs the server on Edge Functions. Cloudflare stores the encrypted backups, in the approved R2 wording. Vercel hosts only the legal pages.                                                 |
| International processing                       | New paragraph: the database stays in Canada Central, but the function runs in the region closest to each request.                                                                                            |
| Retention and deletion                         | The approved October 30 backup and recovery paragraph, and the approved plain-language provider-recovery paragraph, replace the old provider-recovery paragraph.                                             |

No product analytics, tracking SDK or new data category is added. The legal pages
stay on Vercel until Anthony moves them.

## Recorded facts behind the wording

- **API host.** The `api` Edge Function in Supabase project
  `kmcpcauaxlgpevkkenwd` serves staging, and TestFlight build 7 points at it.
  [Appendix A](../implementation-plan/phase-15-supabase-api.md#appendix-a-prototype-evidence)
  holds the P15-2 and P15-9 receipts.
- **Region.** The database sits in Canada Central (`ca-central-1`). Edge Functions
  [run in the region closest to the caller](https://supabase.com/docs/guides/functions/regional-invocation)
  unless a request pins one. On [#449](https://github.com/anthonyyoo24/justgo/issues/449),
  where Anthony delegated the pick, the decision is to pin `ca-central-1` later,
  in a separate mobile change and build. Build 7 sends no pin, so the published
  region sentence is accurate. The pin change carries a one-sentence notice
  update, which Anthony approves and which is published before the pinned build
  reaches testers. Network, support and recovery processing still reach outside
  Canada, so the placement sentence stays.
- **Network.** The gateway passes `cf-connecting-ip` (P15-2 lane 4), which indicates that Supabase's
  edge network runs behind Cloudflare. That is Supabase's arrangement, covered by the
  existing sentence on hosting and network providers. It is separate from
  JustGO's own Cloudflare R2 account.
- **Log content.** P15-2 lane 5 scanned 63 log rows and found no bearer, header or
  body canary. P15-9 lane 9 read 780 rows from the `api` function: only request
  start and finish lines with method, status and cursor query strings, and no
  token, body or writing. Supabase documents that
  [request and response bodies are not logged](https://supabase.com/docs/guides/functions/logging),
  and that the invocation log keeps no `authorization` header.
- **Log retention.** Neither run recorded a retention period. Supabase's
  [pricing](https://supabase.com/pricing) lists API and database log retention as
  1 day on Free, 7 on Pro, 28 on Team and 90 on Enterprise, and gives no separate
  figure for function logs. The project is on Free. The public text names no
  number, because a plan change would make it false. Read the retention in the
  dashboard before publication if Anthony wants a number.
- **Agreement.** Supabase's Terms (§7(b)) incorporate the DPA, and the
  [data inventory](DATA_INVENTORY.md#provider-agreements) records its sensitive-data
  condition. Journal traffic through Edge Functions falls under the same DPA as
  the database. Issue [#95](https://github.com/anthonyyoo24/justgo/issues/95)
  carries the restated provider review.

## Approved R2 wording and its conditions

The provider bullet keeps only the backup role from the approved Cloudflare
bullet. The retention paragraphs are the October 30 text, word for word,
including "Account users must sign in again after a service restore."

- Backups were paused from November 6 to November 13, 2026. They resumed before
  publication: database run
  [43467724155](https://github.com/anthonyyoo24/justgo/actions/runs/43467724155)
  and ledger run
  [43467743601](https://github.com/anthonyyoo24/justgo/actions/runs/43467743601)
  succeeded, and a separate read-only check matched each object's size, checksum
  and seven-day expiry. The [backup guide](../operations/CLOUDFLARE_BACKUPS.md)
  owns the schedule and credential dates.
- Seven-day retention, protection and expiry were approved on October 30, and
  configuration readback and lock enforcement passed. Actual asynchronous expiry
  has not been observed.
- Do not publish a guaranteed eight-day maximum. Cloudflare describes normal
  [lifecycle timing](https://developers.cloudflare.com/r2/buckets/object-lifecycles/),
  not an erasure deadline.
- Hourly copying leaves a gap after the last copy. The text promises neither
  recovery of every new record nor a complete ledger after total loss.

## App Privacy and inventory assessment

The move changes the processor that handles the API, not what the app
collects. The existing linked account, history, Health and Other User Content
assessments still apply. R2 recovery copies stay in the inventory, and encryption
alone does not make them Not Linked. The two unfinished Sentry diagnostic
categories, Supabase consent and provider-copy questions, and native evidence
remain Phase 14 work. No Apple answers change here.

## Publication

- Published on November 13, 2026, the version's effective date, as Vercel
  deployment `dpl_7Kgiug8ta2uaBvBwELzxf8dWbcdy` of project `justgo-legal`, by
  the [legal site guide](../../sites/legal/README.md#publishing-updates). The
  dry run and the upload held exactly the six allowed files.
- Anonymous HTTPS reads of `/`, `/privacy/`, `/terms/`, the stylesheet and the
  logo matched the production build byte for byte. The footer links resolve
  from every page, and `/.env.local`, `/vercel.json` and the review-record path
  return 404. At 375 pixels in the browser pane the logo loads and the page has
  no horizontal scroll. Reading on the signed iPhone remains Phase 14 acceptance.
- `BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION` in the `testflight-beta`
  environment now holds `2026-11-13-supabase-edge`, so the beta preflight
  (`scripts/release/check-beta.mjs`) accepts diagnostics builds against it.
- Builds before 7 keep their embedded Vercel addresses, so retire them rather
  than relying on a source change.
- Operations watch Supabase's and Cloudflare's sub-processor notices, as each DPA
  provides.
