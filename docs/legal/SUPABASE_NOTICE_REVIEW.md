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
- **Region.** At publication the database sat in Canada Central
  (`ca-central-1`). Edge Functions
  [run in the region closest to the caller](https://supabase.com/docs/guides/functions/regional-invocation)
  unless a request pins one. Build 7 sends no pin, so the published region
  sentence is accurate for it. The planned `ca-central-1` pin
  ([#449](https://github.com/anthonyyoo24/justgo/issues/449)) was dropped when
  Anthony chose to move to us-east-1. The
  [U.S. region candidate](#us-region-candidate) below carries that change.
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

## U.S. region candidate

Candidate `privacy-us-east-candidate` in
[PRIVACY_POLICY_DRAFT.md](PRIVACY_POLICY_DRAFT.md) is `owner-review-required`
with no effective date, so the production legal build and the beta preflight
refuse it. It backs [Phase 15A](../implementation-plan/supabase-us-move.md#us-9),
which moves the database, Auth and the `api` function to a new Supabase project
in us-east-1 (North Virginia). It changes the two international-processing
paragraphs and nothing else:

|           | Published (`2026-11-13-supabase-edge`)                                                                                                                                                                                                                                     | Candidate                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Placement | Our primary database remains in Canada Central. Supabase runs the server in the region closest to each request, so requests and connection information may be processed outside Canada. Database placement does not mean all processing or recovery copies stay in Canada. | Our database and the server run in the United States, in Supabase's us-east-1 region in Virginia. We store and process your account, history, journal and sign-in information in the United States, where U.S. courts, law enforcement and national security authorities may access it under U.S. law. Database placement does not mean all processing or recovery copies stay in the United States. |
| Providers | Information processed abroad may be subject to foreign laws and lawful-access requirements.                                                                                                                                                                                | Information processed abroad, including in the United States, may be subject to foreign laws and lawful-access requirements.                                                                                                                                                                                                                                                                         |

The other sentences of the providers paragraph stay word for word. The
operator's Ontario address stays.

- **What makes it true.** Build 8 points at the new project and sends
  `x-region: us-east-1` on every API request, so Supabase runs the `api`
  function beside the database. US-7 reads `x-sb-edge-region: us-east-1` back
  from build 8's code path.
- **Disclosure.** OPC cross-border guidance, cited in the
  [release disclosures](RELEASE_DISCLOSURES.md#regional-assessment), expects
  notice that information held in another country may be accessed by its
  courts, law enforcement and national security authorities. The new placement
  paragraph says so for the United States.
- **Builds.** Build 7 and earlier keep the Canada project until US-10 retires it.
  Publish only together with build 8, never while build 7 is the build testers
  use.
- **Before publication.** Anthony approves the text. At publication, set
  `legal-version` to `2026-11-<dd>-us-east`, where `<dd>` is the publication
  day, with `publication-status: owner-approved` and the same `effective-date`.
  Publish by the [legal site guide](../../sites/legal/README.md#publishing-updates),
  record it in [APPROVALS.md](APPROVALS.md), and set
  `BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION` to the published version.
- **Legal review.** A lawyer should review the cross-border wording before the
  paid launch at the latest.
- **Inventory.** The [data inventory](DATA_INVENTORY.md) and
  [release disclosures](RELEASE_DISCLOSURES.md) record the move by build. The
  data collected and the App Privacy answers do not change.

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
