# Implementation plan

## Stage overview

Open device, release and disclosure gates are issues in the [External beta][beta]
and [App Store release][store] milestones.

| Phase                                                               | Outcome                                                                                                         | Depends on                                  | Status                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| 01 — Foundation & implementation decisions                          | A reproducible workspace and a clear list of decisions to settle before each feature.                           | None                                        | Complete                                    |
| 02 — No-signup identity & recovery                                  | A real account survives supported recovery paths, without exposing another person’s history.                    | 01                                          | Implemented                                 |
| 03 — App shell & shared API                                         | The app restores the right account and provides consistent navigation and network behavior.                     | 02                                          | Implemented                                 |
| 04 — Challenge deck & reliable attempts                             | Browsing, accepting, then completing or giving up a challenge works against real cloud data exactly once.       | 03                                          | Implemented                                 |
| 05 — Feelings & typed reflections                                   | A completed attempt can have optional private feedback and typed reflection text.                               | 04                                          | Implemented                                 |
| 06 — Progress calendar & saved history                              | Users can view the full Progress summary and calendar, and read day details and saved reflections.              | 05                                          | Implemented                                 |
| 06A — Code quality & test hardening                                 | Existing code is easier to understand and change, with meaningful regression tests and durable coding guidance. | 06 (local)                                  | Complete                                    |
| 07 — API & offline saving                                           | Completions and reflections display after local saving and synchronize reliably through resource APIs.          | 06A                                         | Implemented                                 |
| 08 — Settings & privacy controls                                    | Users control recovery, private data and preferences, including confirmed account deletion.                     | 07.5                                        | Complete                                    |
| 08A — Structure, docs & tooling cleanup                             | Routes, folders and docs match how the app works today. CI is faster and deterministic. Users see no change.    | 08 merged, no other open feature branch     | Merged; local branch cleanup open           |
| 09 — App continuity & Reflection exit                               | Saved shuffled venue decks, remembered venue and one bottom Reflection exit.                                    | 08, 08A                                     | Implemented                                 |
| 10 — Terms & Privacy entry                                          | Ordinary Terms and Privacy links and Continue-based account creation, without legal tracking.                   | 09                                          | Implemented                                 |
| 11 — App crash & error reporting                                    | Sentry crash and error delivery excludes private content and preserves recovery.                                | 08, 10                                      | Implemented                                 |
| 12 — Legal documents & release disclosures                          | Reviewed public notices and acceptance copy match the launch build, with product analytics disabled.            | 08–11                                       | Notices published                           |
| 13 — Local data, optional accounts and cloud sync                   | One continuous journal, optional Apple and Google accounts, cloud sync and concise Account and Data controls.   | 07–12                                       | Merged                                      |
| 14 — Release validation & launch                                    | A free beta validates the core product, then the complete paid product is ready for store submission.           | 08–13 for beta; accepted 16 for paid launch | Internal TestFlight build 5 delivered       |
| [15 — API hosting & recovery](phase-15-supabase-api.md)             | Move the Hono API to one Supabase Edge Function, keeping PostgreSQL, Auth and the R2 recovery path.             | 14 internal beta; before 14 external beta   | Planned; awaiting Anthony's go              |
| [16 — Native subscriptions & reliable billing](phase-16-billing.md) | Verified purchases unlock promptly, and later subscription changes recover reliably.                            | 07.5; activate after free beta              | Local work in progress; activation deferred |

[beta]: https://github.com/anthonyyoo24/justgo/milestone/1
[store]: https://github.com/anthonyyoo24/justgo/milestone/2

## Release order

The remaining phases run in this order:

1. 14 internal beta.
2. 15 API hosting and recovery.
3. 14 external free beta.
4. 16 billing activation and acceptance.
5. 14 paid launch.
6. 17 analytics.

Phase 15 must close before outside testers store real journals. Anthony
confirmed Supabase Edge Functions as the API host and retired the Cloudflare
Workers rollout. The [Supabase plan](phase-15-supabase-api.md) waits for his go
and does not authorize a Pro upgrade. The [Cloudflare plan](phase-15-cloudflare-api.md)
is superseded and stays as history.
Planning this move does not commit the app to a commercial launch. Prepared
billing code can be reviewed while activation waits.

## Unscheduled roadmap

These phases have no plan file. Each row keeps the product intent and the owner
decisions that apply. When Anthony schedules a phase, write its plan with fresh
technical detail. None of them gates the first App Store submission.

| Phase                                      | Intent                                                                                                                                                                                                                                                                                                  | Trigger and owner decisions                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17 — Product analytics & PostHog dashboard | PostHog events and a dashboard show which challenges and venues people take on, how often they finish, how feelings and reflections relate to what they do next, and what brings them back.                                                                                                             | After paid launch, with 09, 10 and 12–13 in place. The exporter stays disabled until a reviewed permission and collection design, updated notices and a signed build pass, as PRD section 8 and AC-16 require. On October 15 Anthony approved an explicit event allowlist and a `start_id` that never enters saved attempts, the API or PostgreSQL.                                                                                 |
| 18 — Lock-screen countdowns                | The accepted challenge's countdown shows on supported lock screens without a JavaScript background timer. Dismissing the display, navigating away or force-quitting never counts as giving up.                                                                                                          | After paid launch. Does not need analytics. Add Android only when Android itself is scheduled.                                                                                                                                                                                                                                                                                                                                      |
| 19 — Optional US iOS web checkout          | Eligible users buy on the web with the same app identity. Stripe Checkout opens in the external browser, verified webhooks grant access, the return link grants nothing, and native purchase stays the fallback. Eligibility is never guessed from GPS or IP, and no credential goes in a checkout URL. | After paid launch. Does not need analytics. Before building, recheck Apple's storefront rules and Superwall's Stripe support, and get the rollout scope approved.                                                                                                                                                                                                                                                                   |
| 20 — AI text coach                         | A separately approved text coach in the existing API streams replies. It uses only the current conversation unless the user explicitly shares reflection or activity history, a choice separate from analytics consent.                                                                                 | After paid launch. Needs neither analytics nor Stripe, so it can be scheduled first. Phase 13 keeps feelings and text on the phone, and manual backup or import grants no AI permission.                                                                                                                                                                                                                                            |
| 21 — Backup credential issuer              | Backup jobs get short-lived R2 upload credentials automatically, without giving CI the parent signing credential or the backup decryption key.                                                                                                                                                          | Optional. Only after accepted 16 and 17 and an actual App Store publication. A TestFlight build, submission or review approval does not count. It does not gate 15, beta or the first release. Anthony's October 31 request authorized planning only. He keeps [manual renewal](../operations/CLOUDFLARE_BACKUPS.md) until an approved replacement runs. The `age` decryption identity stays on his Mac, outside CI and the issuer. |
