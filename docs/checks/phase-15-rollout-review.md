# Phase 15 rollout review

Review checkpoint: November 2, 2026, 23:40 UTC. Phase 15 remains open.
This prepares one consolidated phase review; it authorizes no Git publication,
merge, paid subscription, final build, source pause or recovery-key use.
The [phase handoff](../handoffs/phase-15-cloudflare-api.md) retains earlier
implementation, phone and provider evidence.

## Delivered and verified

| Area                | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                        | Limit                                                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone               | Genuine Google/Apple sign-in, guest preservation, online/offline synchronization, account/data deletion, native iCloud read-back and cleanup passed.                                                                                                                                                                                                                                                                    | Concurrent UI follow-up has its own phone acceptance; do not repeat or disturb it. Final replacement TestFlight is separate.                                                                                                                        |
| Hourly copies       | Native scheduled ledger run [41531402685](https://github.com/anthonyyoo24/justgo/actions/runs/41531402685) and Cloudflare-clock ledger runs [41536825031](https://github.com/anthonyyoo24/justgo/actions/runs/41536825031), [41545030056](https://github.com/anthonyyoo24/justgo/actions/runs/41545030056) succeeded on reviewed main `d66c42d`. Independent R2 HEAD checks matched size/checksum and seven-day expiry. | Native schedules were hours late. These ledger copies do not establish scheduled nightly database execution.                                                                                                                                        |
| Backup timer        | Approved separate Cron Worker `justgo-staging-backup-clock`, version `8dcf5dc4-5fc2-413c-aaa6-9b16f4a04b6a`, dispatched at 22:23:13 and 23:23:13 UTC. Each recorded one successful invocation/outbound request and zero errors.                                                                                                                                                                                         | No public HTTP route or database/R2/recovery-key credentials. Repository Actions write access cannot be restricted to one workflow. The tracked configuration stays disabled; preserve the protected activated configuration for later deployments. |
| Alerts              | Owner received the actual missed-backup email. Sentry monitor `justgo-staging-backup-health` later showed successful check-ins and the incident resolved.                                                                                                                                                                                                                                                               | A short initial drill did not deliver mail. Built-in test mail alone was not treated as incident-delivery evidence. The monitor's `production` environment tag does not change its staging purpose.                                                 |
| Restore preparation | Guarded loopback restore supports native archive owner/ACL restoration and awaited checks around the first ledger replay. Local PostgreSQL encrypted rehearsal and 186 backup/clock unit tests passed. A pinned real Auth service plus the actual API passed isolated synthetic sign-in, invalidation, fresh-owner continuity and deletion controls.                                                                    | No actual R2 archive was restored in this checkpoint. No protected key or hosted source pause was used. The full coordinated source/target lifecycle remains to be executed and verified.                                                           |

The second clock copy was captured at 23:25:24.557 UTC: 32,515 bytes, SHA-256
`808ae80143da8e4c142d9532b811b4af007ba549291cb611cdce709332ccfcbf`,
expiry November 9 at 23:25:25 UTC. Cloudflare's matching success was independently
read through its analytics API. Safe receipts remain in ignored
`.local/phase15-cloudflare/rollout/phone-google-2026-11-01/` in the original checkout.

## Checks still open

1. **Nightly database copy.** The first new-clock database slot is November 3 at
   04:43 UTC, November 2 at 11:43 p.m. Toronto. A one-time read-only follow-up is
   set for November 3 at 12:10 a.m. Toronto. Verify Cron attribution, the database
   job, encrypted object size/checksum/expiry and monitor health. The latest
   database copy before this slot was manual run `41500830932`.
2. **Real recovery.** Wait until phone UI testing finishes. Refresh and review all
   source/target bindings below, then obtain specific key/source-pause approval.
   Keep the target isolated throughout; a successful test never authorizes API reopening.
3. **Credentials and expiry.** Complete the renewal approval below before the
   November 5 cutoff, then observe the November 6–8 canary removal. Expiry metadata
   and lock rejection are verified; eligibility dates and removal remain ahead.
4. **Phase integration and release.** Review the recovery task commits and
   accepted UI changes together, obtain explicit local merge/publication
   permissions, then run combined publication gates. One final phase PR remains
   the agreed workflow. Notices/date/version, final TestFlight acceptance and
   coordinated Vercel retirement remain separate approvals and gates.

## Prepared credential renewal approval

Renew preferably November 4, before the uploader's **November 5, 10:39:59 a.m.
Toronto** guard cutoff. Its credential expires 10:59:59 a.m.; the parent expires
noon and the inspector 6:06:08 p.m. Renewing only the uploader is insufficient.

The concrete proposed action replaces the existing parent, derived uploader and
inspector, with unchanged scopes and these UTC expirations:

| Replacement      | Scope/custody                                                                                             | Proposed expiry                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Parent           | Object Read & Write, `justgo-staging-backups` only; protected Mac storage, outside CI                     | November 9, 17:00:00 UTC                              |
| Derived uploader | PutObject/HeadObject only, `staging/database/` and `staging/ledger/`; existing protected workflow secrets | November 9, 15:59:59 UTC; guarded cutoff 15:39:59 UTC |
| Inspector        | Existing approved R2 Admin Read Only for this account's buckets; no expansion                             | November 9, 23:06:08 UTC                              |

All proposed lifetimes are under seven days if issued after this review checkpoint;
recompute and present dates if the proposal is revisited after its useful window.
Approval must cover creating the replacements, updating the existing three
`R2_UPLOAD_*` secrets and `R2_INSPECT_TOKEN`, verifying unchanged scope with one
controlled database and ledger backup/readback, and retiring superseded credentials
only after replacement verification.
It includes no recovery-key use, new account, paid plan or retention change.
Record the next manual renewal deadline before finishing rotation.

Original canary expiry eligibility is November 6 at 13:22:01 UTC (database) and
13:22:37 UTC (ledger). Replacement canaries are eligible approximately November 7
at 18:34 UTC; exact expiry headers were not persisted. R2 removal is asynchronous,
typically within 24 hours of eligibility, rather than a strict deadline. Observe
through November 6–8. Confirm the renewed inspector can read a newer known-present
object before treating a canary's 404 as expiry. Never delete, unlock or shorten
retention to manufacture a pass. See [R2 lifecycle behavior](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
The clock's separate GitHub token has a later guard cutoff: November 29 at
23:40 UTC, 6:40 p.m. Toronto.

## Coordinated real-recovery procedure

1. Prepare one run-owned loopback PostgreSQL cluster/database and a normally
   trusted local HTTPS Auth gateway, using fresh local passwords/JWT keys and the
   allowlisted role names. Pin Auth v2.197.0. The official Darwin archive SHA-256
   is `3fb7998e7061e2c14f3f9555b1d94d447358c965395728e0d81eac82e0e5868b`;
   its executable SHA-256 is `54a5afe7997bd16ab5244ab12c02905048b270a8f76eebf95739a6d364ffe01f`.
   Auth and the API stay nonsuperuser; API stays `justgo_runtime` without migrator
   membership. Local Auth also uses NOCREATEROLE, stricter than the hosted role.
   Use only a local rejecting SMTP destination and no external OAuth.
2. Bind an exact real R2 database ciphertext by object key, capture time, size,
   checksum and source/migration identity. Retrieve and verify ciphertext without
   using the private key. Refresh source catalog, reviewed object access, Auth
   version/public-key configuration and verified-TLS reader identity. The current
   reviewed object-access query is `scripts/backups/recovery-target-access.sql`;
   compare its `.metadata`, not observation timestamp/database name.
3. After phone testing, present one specific approval covering those artifacts,
   protected `age` key use through pipes and a maximum 45-second staging write
   pause/no-manual-DDL/Auth/config/migration-change window. The prior two-file
   decryption approval is consumed and cannot be reused.
4. The connected operator holds the reviewed domain SHARE locks, migration-
   registry ACCESS SHARE lock and run-unique advisory marker. A separate fresh
   READ COMMITTED TLS reader verifies physical locks, backend/transaction identity,
   catalog and Auth configuration throughout. Capture/encrypt the final ledger
   only after the marker is ready. ACCESS SHARE does not block registry inserts;
   the approved no-change window and drift checks remain necessary. Do not claim
   a physical fence against provider migrations or change-and-revert detection.
5. Restore the exact database and final ledger with the guarded `restoreLocal`,
   `preserveOwnership: true` and closed-target hooks. Compare reviewed owners,
   current-object ACLs/RLS, extensions and restricted roles; install/check the exact
   private session helper. Record the Auth migration-registry hash before starting
   `serve`; do not run `migrate` on the actual archive. Fail if startup or later
   checks change the registry/version or expected access metadata.
6. Require one unambiguous existing archived disposable Apple subject and its
   canonical mapping. Mint local recovery-link T0 without creating or changing
   identities; prove actual API exchange/readiness and live-session lookup.
   Replay the validated ledger once. Prove the still-valid T0 fails specifically
   for a missing Auth session, refresh fails `refresh_token_not_found`, app session
   is revoked and the private helper is false. Fresh T1 must resolve the same
   canonical owner/current epoch. Actual API account deletion must erase local
   writing, complete Auth cleanup and reject access/refresh. Independently retain
   the core ledger's tombstone/epoch/revocation/deleted-owner assertions.
7. Latch any timeout, disconnect or drift, cancel target work and await all owned
   services/processes and local-data cleanup before releasing source locks. Hold
   the stop marker until the operator statement finishes; a provisional local
   result is not success without the operator's final catalog check and normal
   completion. Reopening remains forbidden. Keep only redacted fixed outcomes;
   no email, UUID mapping, token, credential or reflection content in receipts.

This procedure is reviewed preparation. Source pause, actual protected decryption,
archive/target comparison and the complete coordinated run are **unverified**.
The synthetic walkthrough is separate evidence and is not a saved CI journey or
proof of Apple OAuth on restored data. Do not offer the execution approval until
the exact operator/target commands and cancellation/cleanup have been reviewed
against the final artifacts and current phone-test status.
