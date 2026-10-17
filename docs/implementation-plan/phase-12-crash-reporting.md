<a id="phase-12"></a>

# Phase 12 — App crash & error reporting

**Status:** Not started; crash-reporting provider not installed or enabled

## Outcome

Production app crashes and unhandled failures become visible through a configured error-reporting provider without sending private journal or credential data.

## Decisions in force

- Dependencies: 11; reuse Phase 08's root ErrorBoundary and diagnostic allowlist, and Phase 10's account/acceptance boundary wherever the reviewed reporting basis requires it.
- Preserve the original app-reporting requirement [SEC-1]. Provider choice (for example Sentry), reporting fields and privacy basis must be recorded; final legal review remains Phase 13.

## Implement

- Add app crash and unhandled-error reporting and connect it to the root ErrorBoundary. Preserve the usable retry/recovery screen and keep reporting failures isolated from startup, product saves, recovery and paid access.
- Scrub reports to the same allowlist as server logs: never reflection text, feelings, tokens, recovery keys or request bodies. Inspect SDK defaults, breadcrumbs, automatic context and network metadata so they cannot bypass that boundary.
- Record the configured provider/environment, identifiers, fields, IP handling, region, retention and applicable deletion/privacy-request cleanup in the data inventory. Settle with Phase 13 whether reporting falls under onboarding acceptance or the Privacy Policy alone; do not presume that analytics acceptance authorizes undisclosed diagnostics. If that decision is needed before enabling delivery, resolve it before enabling the provider.
- Test a controlled crash/unhandled failure, payload redaction and a provider outage using disposable fixtures. Verify root-boundary recovery and applicable account/eligibility fencing with automated and interactive evidence; distinguish browser, simulator and physical-device results.
- Update relevant architecture/inventory documentation and carry signed-build reporting acceptance into Phase 14.

## Keep out

- No product analytics expansion, session replay, private user-content reports, custom monitoring dashboard or performance-monitoring scope without approval.
- Server uptime/5xx monitoring stays in Phase 14. No release deployment, final legal publication, native signing upgrade or App Store submission is authorized by this phase.

## Ready to hand off when

- [ ] Controlled app crashes/unhandled failures reach the configured provider, and the ErrorBoundary still offers usable recovery.
- [ ] Payload-exclusion, reviewed eligibility/account handling and provider-outage tests pass; failures do not interrupt product saving or access.
- [ ] Provider settings, field inventory, privacy basis and applicable cleanup are recorded for Phase 13 without claiming unverified retention or legal sufficiency.
- [ ] Required phase checks and affected UI verification pass; save a handoff with actual reporting evidence and explicit signed-build/device gates and link it from the index.

## Open gates for Phases 13 and 14

- Phase 13 reconciles actual diagnostic collection and the reviewed privacy basis with public notices/disclosures.
- Phase 14 verifies crash/error reporting, redaction and recovery on the signed beta/release build alongside server monitoring.
