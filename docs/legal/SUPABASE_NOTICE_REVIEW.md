# Supabase notice — text approved, publication pending

This review backs the Phase 15 Privacy Policy version
`2026-11-13-supabase-edge`, in
[PRIVACY_POLICY_DRAFT.md](PRIVACY_POLICY_DRAFT.md). The API moved from Vercel and
a Cloudflare Worker to the Supabase Edge Function `api`
([Supabase plan](../implementation-plan/phase-15-supabase-api.md), P15-10). The
Anthony approved the text on November 13, 2026, and [APPROVALS.md](APPROVALS.md)
records it. It is not published, and publication needs his separate go. The
published Privacy Policy stays `2026-10-27-essential-errors`, which still names
Vercel as the API host. Terms need no hosting change.

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
  unless a request pins one. The pin is undecided until the hosted region lane
  runs ([#449](https://github.com/anthonyyoo24/justgo/issues/449)). If Anthony pins
  `ca-central-1`, the region sentence can say so, but network, support and
  recovery processing still reach outside Canada, so the placement sentence stays.
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

- Backups are paused (`JUSTGO_BACKUPS_ENABLED=paused` since November 6, 2026).
  Publish the backup paragraph only after they resume and one nightly and one
  hourly run succeed ([#77](https://github.com/anthonyyoo24/justgo/issues/77)).
  The [backup guide](../operations/CLOUDFLARE_BACKUPS.md) owns the schedule.
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

## Before publication

- Anthony approved the text on November 13, 2026. The draft carries
  `2026-11-13-supabase-edge`, effective 2026-11-13. If publication happens
  later, set the version and effective date to the publication date first,
  rather than backdating them.
- Diagnostics beta builds need `BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION` to
  match the published version, so the beta preflight
  (`scripts/release/check-beta.mjs`) refuses them until this version is
  published and that value changes. Plain beta builds pass.
- No outside tester joins while the published notice names Vercel as the API
  host. Builds before 7 keep their embedded addresses, so retire them rather than
  relying on a source change.
- Backups resume as above before the backup paragraph goes public.
- Publish by the [legal site guide](../../sites/legal/README.md#publishing-updates),
  with Anthony's separate go, and verify both pages anonymously on a phone.
- Operations watch Supabase's and Cloudflare's sub-processor notices, as each DPA
  provides.
