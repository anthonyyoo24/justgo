# Phase 14 prerequisite — physical-phone test server

**Numbering history:** This prerequisite belonged to release Phase 09 before October 14, then Phase 11 after October 14, Phase 14 after the October 17 split, then Phase 13 after the October 18 reorder, and now Phase 14 after the October 20 local-journal insertion. Implementation dates, test evidence, deployment/build identifiers and historical `.local/phase-09/` artifact paths are preserved. Renumbering does not accept the free beta or close any native/release gate.

October 11, 2026. Branch: `codex/phase-08-settings-privacy`. Anthony explicitly approved bringing forward the existing hosted test-server update and approved-account free access so Phase 08 can be tested on his iPhone. This is a narrow Phase 14 prerequisite; Phase 08, the free TestFlight beta and paid launch remain incomplete. Native billing stays on its separate 07A branch. No Git push, PR or merge was performed.

## Implementation

`apps/api/src/access/beta-access.ts` supplies current access and historical upload coverage through the existing verified-session transaction. Only operator-configured account UUIDs qualify. Strict private `BETA_ACCESS_GRANTS` JSON requires start/expiry dates, unique owners and an optional revocation boundary. `APP_ENVIRONMENT` defaults to `production`; nonempty grants are rejected outside explicit `staging`. Production composition retains unavailable access until billing is connected. There is no public grant endpoint, client premium flag, automatic admission or deployed fixture.

Current access ends at expiry or revocation. Keep the historical grant and set `revokedAt` to stop current access: uploads with an original start inside the interval remain eligible after reconnecting. Already accepted identical attempts still replay before coverage checks. Recovery/session validation, account ownership, RLS and account deletion checks remain in force. Grant changes require updating the private server environment and redeploying; they require no compatible native rebuild.

The strict access/OpenAPI contract optionally identifies `source: free_beta`. Unapproved/expired test accounts see a free-testing explanation; Settings identifies the test build. Billing responses without this optional field remain valid. Bring these contract changes into 07A before integrating its separate implementation.

**Offline limit still open:** this prerequisite supplies server-side start-time upload eligibility, not durable offline access admission. The existing mobile guard requires a fresh check within 60 seconds and closes on check failure. Full beta offline start/relaunch/continuation acceptance and any necessary policy implementation remain Phase 14 work; the 07A saved paid-access rules have not been imported or accepted here.

## Hosted cutover and protection

Existing Supabase project: `kmcpcauaxlgpevkkenwd`, JustGo, Canada, free organization. Before cutover it held migrations 0000–0003, four retired accounts, eight devices, ten sessions and six recovery credentials, with no product activity. It was never reset.

A separate `justgo_backup_operator` NOLOGIN/BYPASSRLS role received only USAGE/SELECT for the private JustGO and Drizzle schemas. The migrator temporarily received SET, without inherited membership; runtime never received membership. PostgreSQL 17 `pg_dump` used the session pooler with verified TLS. The protected custom-format snapshot was restored into a newly created isolated loopback database with `--no-owner --no-acl` and the existing migration role, then the disposable database was removed. All six identity-table counts and fingerprints matched after normalizing session time zones to UTC. Role provisioning/ACL recovery is separate from this data/schema restoration proof. The temporary migrator membership was revoked. Backup and proof remain ignored, mode 0600; keep a protected owner-managed copy outside this Mac before broader beta/release use.

The first dump attempt reached restoration but its text fingerprint comparison differed because the remote and local session time zones formatted timestamps differently. Setting UTC on both comparison sessions established matching contents; no shared data was changed to resolve it.

During maintenance, runtime login was disabled, old runtime connections terminated and its password rotated. Private local/operator files and Vercel secrets were updated; login was restored only for the new credential. This fences existing immutable old deployments without deleting account history or disabling preview protection. Do not rebuild an old branch against the current shared environment: a fresh deployment would receive current credentials and must first pass the coordinated compatibility review.

Unchanged registered migrations 0004–0013 were applied with the separate migration role and verified TLS. The October 11 journal reached 14 entries; all original identity counts/fingerprints matched. The canonical catalog has 61 active placements, no attempts existed at that cutover, and all private tables retain forced RLS. Runtime remains non-superuser, without role/database creation, RLS bypass or migrator/backup membership. An initial migration launch stopped at the existing production rate-key configuration guard before connecting; supplying the private configured key allowed the registered migration runner to succeed.

Existing Vercel project: `justgo`, scope `anthony-youngshin-yoos-projects`. A protected matching preview was built first: `dpl_8LB4E2puQ784EEZrBRgHR4VYDGSv`. Authenticated readiness passed; missing authorization returned 401 and the old identity route returned 404. Initial readiness during credential/cold-connection turnover returned unavailable, then passed. The older Phase 02 deployment's readiness remains unavailable with its obsolete credential.

**Phone route:** <https://justgo-two.vercel.app>. The existing project's stable production deployment slot hosts the **application staging** API/database for this owner-device preparation. This is deliberate test infrastructure, not the paid/release environment or an App Store release. `APP_ENVIRONMENT=staging` is explicit on that slot. Existing `all_except_custom_domains` protection remains unchanged; generated deployment URLs/previews remain protected. The stable alias accepts normal HTTPS requests while private routes still require verified sessions. No protection bypass is bundled in the app. Verify the intended slot/database before every later deployment; prepare an isolated paid production environment before launch.

The first stable deployment was `dpl_FkoAZFfEnDNE9GP45rvyFiDjixke`. After private owner approval, `dpl_6a3mJC7jFX2FFrupB1skx8217SXJ` served authenticated phone catalog/progress/history requests with 200 responses. The most recent October 11 deployment was `dpl_ENi6zgHhmQwRLuYvBRWHq2csLyuw`, built from the same tested source and current grant configuration on the same stable alias. Public alias readiness returned 200; unauthenticated access and export returned 401. Only 41 allowlisted API/contract/workspace files (about 681 KB) were uploaded; no environment files, fixture scripts, SQL migration directory, local backups, generated iOS projects or mobile source were included.

**Current October 18 state:** Anthony authorized the [Phase 10 endpoint update](phase-10-acceptance.md).
Ready deployment `dpl_3cqvvSe1xWcM9v7SBJsUYtbf972b` now serves both existing
aliases, including the phone route, in `yul1` on Node 24. Verified-TLS forward
migrations 0015–0017 brought the journal to 18 entries after a successful backup
restore and local rehearsal. All 12 existing app tables were compared under locks
inside the migration transaction and preserved before COMMIT. The receipt table
has forced owner RLS and no public/Supabase-client grants. Retention scheduling
was not enabled and no purge ran. Environment configuration, beta grants/window
and protection metadata are unchanged.

Live acceptance reads/writes, stale-version rejection, idempotent retries and
atomic account creation passed with two disposable probe accounts, followed by
normal API deletion and verified cleanup. Ready/authentication checks passed.
The current source passed root checks, database/coverage gates, 37 saved journeys,
web/iOS exports and exported-web smoke; detailed limits and evidence live in the
Phase 10 handoff. The phone Metro server remains on 8081. No Git publication,
native build, provider activation or signed-device acceptance was performed.

## Evidence and phone follow-up

- `npm run check`: passed, including fresh online Expo Doctor, architecture, TypeScript, lint, formatting, 535 mobile tests / 67 suites and 24 contract tests / nine suites after the clock follow-up below.
- `npm run test:db`: seven suites / 55 tests passed against loopback `justgo_test`; the isolated migration/restoration rehearsal also passed.
- `npm run test:coverage`: unchanged all-source/critical floors passed, including the clock follow-up. Mobile lines 95.90%, branches 91.28%; API lines 95.01%, branches 90.61%; contracts 100%/100%. The beta reader itself has 100% line/branch coverage. Tests exercise real session/owner isolation, unapproved/revoked access, expiry/revocation bounds, historical uploads, replay and production defaults.
- Side-panel browser: disposable local account, actual API on 3005 and live Metro on 8081. Unapproved free-test copy, Settings/export reachability, the Free test build footer and Back to the previous access screen were observed. Ignored screenshot: `.local/phase-08/beta-settings-browser.png`. Browser evidence does not establish phone behavior.
- After the clock correction, a fresh disposable approved local account reached real Home with challenge cards; Home → Settings → Back returned to the same Home. Ignored screenshot: `.local/phase-08/beta-home-after-settings-browser.png`. Editing the provider during diagnostics left a disposed runtime in the browser's Fast Refresh session; a full page reload cleared it, discarding only the documented memory-only browser credential. The new disposable account was approved locally; no hosted grant or phone account was reset.
- The Vercel workspace installation audit reports 72 findings (21 moderate, 50 high, one critical); the workspace production audit reports 45. `npm audit --workspace @justgo/api --omit=dev --json` reports **zero** API runtime findings. Remaining Expo/Metro/build-tool dependency findings stay open for Phase 14 release triage; no forced upgrade or audit suppression was performed.

The installed physical EAS development binary remains `1500d7ee-c49a-4047-b88a-278eccdc21bc`, version 0.1.0 (1), bundle `com.anthonyyoo.justgo`. Developer Mode and USB pairing are verified. After the owner enabled/retried Local Network on the same Wi-Fi, Metro observed a real phone bundle request and Anthony confirmed Settings opened; the exact cause of the earlier LAN failure was not isolated.

Only the phone's separate one-worker LAN Metro session on 8084 was restarted with the public staging API URL. A fresh iOS bundle loaded, a real account was created, and Anthony confirmed its displayed reference matches the server inventory. That account was approved privately from October 11 through **November 10, 2026 at 15:23:02 UTC**. Its UUID, credentials and grant JSON remain outside committed documentation. Authenticated challenge catalog requests returned 200, establishing server admission. Anthony reported that the earlier root-link launch left him on the previous screen and he used the developer preview. Restarting the existing app with the live development-server root URL revealed the access-check issue below; no installation, account or data reset was performed.

### Phone clock and real Home follow-up

Anthony reported Settings Back showing “We can’t verify access yet” even though authenticated access/catalog requests succeeded. Temporary development diagnostics recorded `status: verified`, no transport error and a server check **25–46 milliseconds ahead of the phone's receipt clock**. The strict future-timestamp check rejected those responses. No account identifiers, credentials or activity were logged. Direct native debugger inspection was unavailable (origin validation, then evaluation timeout); the temporary source diagnostic was removed after reproducing the timing failure.

`useAccess` now aligns a fresh response to the server clock only for positive differences of at most five seconds. The same offset drives expiry/freshness timers, so alignment does not extend the server-relative validity window. Stale checks and larger future differences remain closed; the shared strict predicate, server authorization and failed-recheck behavior remain unchanged. Four added provider regressions cover 25 ms and five-second alignment, immediate closure at expiry, rejection beyond the bound and closure after sixty seconds when polling is paused. Initial test failures exposed delayed query notifications and receipt-time assumptions; the final tests set controlled receipt timestamps and await notifications without weakening the assertions.

Focused provider tests **16/16**, the fresh root check and root coverage gate pass. At 15:47 UTC the existing physical app was reopened with the updated live bundle. **Anthony confirmed that real Home shows challenge cards and Home → Settings → Back returns to Home.** This is owner-reported physical evidence on the installed iPhone build, separate from the browser walkthrough; no native screenshot/recording was captured. The development connection remains on port 8084 for feature testing. The hosted prerequisite is ready for this owner-device workflow; it does not accept the full free beta.

Keep export Save to Files/open/email-draft/cancel/retry, support/feature drafts, Reduce Motion/relaunch/system override, transition frames, large text and VoiceOver acceptance open until actual phone evidence is recorded. Keychain/reinstall/two-device recovery, broader staged account/device/security journeys, durable offline beta admission, haptics, backup ownership/disaster recovery, TestFlight and paid release remain later gates. Purchases remain inactive.

## October 14 receiving-transfer cancellation API update

Anthony explicitly approved updating this existing hosted test API after the
mobile cancellation implementation encountered its older server contract.
Deployment **`dpl_4BBEqxZmmrv5tJV2CoUwjrqPtHCw`** is Ready on
<https://justgo-two.vercel.app>, runtime region `yul1`. The existing Vercel project,
application-staging slot, protected generated URLs and all environment
configuration IDs/timestamps remain unchanged. No migration, database reset,
account/grant change, native build or Git publication was performed.

The [Phase 08 rollout evidence](phase-08-settings-privacy.md)
records the 41-file allowlisted upload, exact source hashes, live readiness and
authorization checks, receiver cancellation/replay probes and retained native
acceptance. Two unbound probe proposals were cancelled; no accounts, sessions or
activity were created. The phone development server remains on port **8081**;
Retry connection resolves queued cancellation against the new API before starting
a fresh transfer. Physical-phone cancellation/relaunch/offline acceptance and the
existing Expo/dependency release gates remain open.
