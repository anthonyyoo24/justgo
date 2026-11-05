# Implementation plan

## Stage overview

| Phase                                                                 | Outcome                                                                                                         | Depends on                                  | Status                                                                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 01 — Foundation & implementation decisions                            | A reproducible workspace and a clear list of decisions to settle before each feature.                           | None                                        | Complete                                                                                             |
| 02 — No-signup identity & recovery                                    | A real account survives supported recovery paths, without exposing another person’s history.                    | 01                                          | Implemented; device gates in [External beta][beta]                                                   |
| 03 — App shell & shared API                                           | The app restores the right account and provides consistent navigation and network behavior.                     | 02                                          | Implemented; device gates in [External beta][beta]                                                   |
| 04 — Challenge deck & reliable attempts                               | Browse → accept → complete or give up works against real cloud data exactly once.                               | 03                                          | Implemented; device gates in [External beta][beta]                                                   |
| 05 — Feelings & typed reflections                                     | A completed attempt can have optional private feedback and typed reflection text.                               | 04                                          | Implemented; device gates in [External beta][beta]                                                   |
| 06 — Progress calendar & saved history                                | Users can view the full Progress summary/calendar and read day details and saved reflections.                   | 05                                          | Implemented; device gates in [External beta][beta]                                                   |
| 06A — Code quality & test hardening                                   | Existing code is easier to understand and change, with meaningful regression tests and durable coding guidance. | 06 (local)                                  | Complete                                                                                             |
| 07 — API & offline saving                                             | Completions/reflections display after local saving and synchronize reliably through resource APIs.              | 06A                                         | Implemented; device gates in [External beta][beta]                                                   |
| 08 — Settings & privacy controls                                      | Users control recovery, private data and preferences, including confirmed account deletion.                     | 07.5                                        | Complete                                                                                             |
| 08A — Structure, docs & tooling cleanup                               | Routes, folders and docs match how the app works today; CI is faster and deterministic; no user-visible change. | 08 merged, no other open feature branch     | Merged; local branch cleanup open                                                                    |
| 09 — App continuity & Reflection exit                                 | Saved shuffled venue decks, remembered venue and one bottom Reflection exit.                                    | 08, 08A                                     | Implemented; native acceptance in [External beta][beta]                                              |
| 10 — Terms & Privacy entry                                            | Ordinary Terms/Privacy links and Continue-based account creation, without legal tracking.                       | 09                                          | Implemented; release gates in [External beta][beta]                                                  |
| 11 — App crash & error reporting                                      | Sentry crash/error delivery excludes private content and preserves recovery.                                    | 08, 10                                      | Implemented; launch gates in [External beta][beta]                                                   |
| 12 — Legal documents & release disclosures                            | Reviewed public notices and acceptance copy match the launch build, with product analytics disabled.            | 08–11                                       | Notices published; disclosure gates in [External beta][beta] and [App Store release][store]          |
| 13 — Local data, optional accounts and cloud sync                     | One continuous journal, optional Apple/Google accounts, cloud sync and concise Account/Data controls.           | 07–12                                       | Merged; device and privacy gates in [External beta][beta]                                            |
| 14 — Release validation & launch                                      | A free beta validates the core product, then the complete paid product is ready for store submission.           | 08–13 for beta; accepted 16 for paid launch | Internal TestFlight build 5 delivered; gates in [External beta][beta] and [App Store release][store] |
| [15 — API hosting & recovery](phase-15-supabase-api.md)               | Plan a Hono API move from Cloudflare to Supabase, retaining PostgreSQL/Auth and an accepted recovery path.      | 14 internal beta; before 14 external beta   | Planning only; Cloudflare rollout paused                                                             |
| [16 — Native subscriptions & reliable billing](phase-16-billing.md)   | Verified purchases unlock promptly, and later subscription changes recover reliably.                            | 07.5; activate after free beta              | Local work in progress; activation deferred                                                          |
| [17 — Product analytics & PostHog dashboard](phase-17-analytics.md)   | Separately reviewed analytics and reports answer challenge-flow and return-rate questions after paid launch.    | 09, 10, 12–13; 14 paid launch               | Deferred until after paid launch; exporter disabled                                                  |
| [18 — Lock-screen countdowns](phase-18-native-timers.md)              | The same accepted challenge is visible on supported lock screens without a JavaScript background timer.         | 14 paid launch                              | Not scheduled                                                                                        |
| [19 — Optional US iOS web checkout](phase-19-optional-stripe.md)      | Eligible users can purchase on the web using the same authenticated app identity.                               | 14 paid launch                              | Not scheduled                                                                                        |
| [20 — Future AI text coach](phase-20-future-text-coach.md)            | A separately approved text coach uses bounded, permitted context in the existing backend.                       | 14 paid launch                              | Not scheduled                                                                                        |
| [21 — Backup credential issuer](phase-21-backup-credential-issuer.md) | Backup jobs receive automatically issued, short-lived R2 upload credentials.                                    | Accepted 16, 17; 14 App Store published     | Optional; not scheduled                                                                              |

[beta]: https://github.com/anthonyyoo24/justgo/milestone/1
[store]: https://github.com/anthonyyoo24/justgo/milestone/2

## Release order

01 → 02 → 03 → 04 → 05 → 06 → 06A → 07 (07.1 → 07.2 → 07.3 → 07.4 → 07.5; 07.3A deferred; its native replacement is [#114](https://github.com/anthonyyoo24/justgo/issues/114)) → 08 → 08A → 09 → 10 → 11 crash reporting → 12 legal preparation → 13 optional accounts/cloud sync → 14 internal beta → 15 API hosting and recovery → 14 external free beta → 16 billing activation/acceptance → 14 paid launch → 17 analytics.

Phase 15 must close before outside testers store real journals. Its Cloudflare
rollout is paused; the [Supabase migration plan](phase-15-supabase-api.md) is
planning only and does not authorize implementation or a Pro upgrade. The
[earlier Cloudflare plan](phase-15-cloudflare-api.md) retains the earlier scope;
completed evidence remains in the handoff. No later
phase is renumbered, and planning this move does not commit the app to a commercial
launch. Prepared billing code can be reviewed independently while activation
waits. Legal review can run alongside crash-reporting implementation, but final
notices and acceptance copy must describe the verified build with product
analytics disabled. Phase 17 analytics is deferred until after paid launch; it
must review notices, its permission/collection design and signed-build delivery
before activation. Phases 19–20 are separately scheduled after paid launch, do
not depend on analytics and do not block the first submission.

[Optional Phase 21](phase-21-backup-credential-issuer.md#phase-21) may be scheduled
only after accepted Phase 16 billing, accepted Phase 17 analytics and actual
Phase 14 App Store publication. It does not require Phases 18–20 and does not
block Phase 15, beta testing or the first store release. Anthony retains manual
backup-credential renewal until an approved replacement is operating.
