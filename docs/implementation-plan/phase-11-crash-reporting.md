<a id="phase-11"></a>

# Phase 11 — App crash & error reporting

**Status:** Implemented locally; reporting scope approved. Notices/activation and signed-build acceptance open. See the [handoff](../handoffs/phase-11-crash-reporting.md).

## Outcome

Production app crashes and unhandled failures become visible through a configured error-reporting provider without sending private journal or credential data.

## Decisions in force

- Dependencies: 08 and 10; reuse the root ErrorBoundary, diagnostic allowlist and account/privacy boundary wherever the reviewed reporting basis requires it. Deferred Phase 14 product analytics is not a prerequisite.
- Preserve the original app-reporting requirement [SEC-1]. Anthony selected Sentry before legal finalization and paid launch. The `anthony-corp` organization has a React Native `justgo-mobile` project in the US region; the SDK and synthetic delivery are implemented, while ordinary real-user delivery stays disabled pending launch gates. Anthony approved minimal essential diagnostics under the Privacy Policy before onboarding acceptance on October 18. The handoff records field/redaction evidence; verify actual plan/retention and matching notices before activation; final legal review remains Phase 12.

## Implement

- Add app crash and unhandled-error reporting and connect it to the root ErrorBoundary. Preserve the usable retry/recovery screen and keep reporting failures isolated from startup, product saves, recovery and paid access.
- Scrub reports to the same allowlist as server logs: never reflection text, feelings, tokens, recovery keys or request bodies. Inspect SDK defaults, breadcrumbs, automatic context and network metadata so they cannot bypass that boundary.
- Record the configured provider/environment, identifiers, fields, IP handling, region, retention and applicable deletion/privacy-request cleanup in the data inventory. Preserve Anthony's approved minimal essential diagnostics under the Privacy Policy, including startup before onboarding acceptance; no legal acceptance receipt is recorded or used to gate this narrow reporting. Phase 12 reviews matching notices and applicable requirements before activation. Do not use Continue or implied agreement to authorize expanded diagnostics.
- Test a controlled crash/unhandled failure, payload redaction and a provider outage using disposable fixtures. Verify root-boundary recovery and applicable account/eligibility fencing with automated and interactive evidence; distinguish browser, simulator and physical-device results.
- Update relevant architecture/inventory documentation and carry signed-build reporting acceptance into Phase 13.

## Keep out

- No product analytics expansion, session replay, private user-content reports, custom monitoring dashboard or performance-monitoring scope without approval.
- Server uptime/5xx monitoring stays in Phase 13. No release deployment, final legal publication, native signing upgrade or App Store submission is authorized by this phase.

## Ready to hand off when

The local implementation evidence below is complete; the Phase 12/13 launch gates remain open.

- [x] Controlled app crashes/unhandled failures reach the configured provider, and the ErrorBoundary still offers usable recovery.
- [x] Payload-exclusion, reviewed eligibility/account handling and provider-outage tests pass; failures do not interrupt product saving or access.
- [x] Provider settings, field inventory, privacy basis and applicable cleanup are recorded for Phase 12 without claiming unverified retention or legal sufficiency.
- [x] Required phase checks and affected UI verification pass; save a handoff with actual reporting evidence and explicit signed-build/device gates and link it from the index.

## Open gates for Phases 12 and 13

- Phase 12 reconciles actual diagnostic collection and the reviewed privacy basis with public notices/disclosures.
- Phase 13 verifies crash/error reporting, redaction and recovery on the signed beta/release build alongside server monitoring.
