<a id="phase-20"></a>

# Phase 20 — Future AI text coach

**Status:** Not scheduled

## Outcome

A separately approved text coach uses bounded, permitted context in the existing backend.

## Decisions in force

- Dependencies: Phase 14 paid launch; Phase 17 analytics is not a prerequisite.
- Acceptance: PRD §9 · Tech §10; acceptance 11, 16–17
- Preserve the open [`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate).

- Phase 13 keeps feelings/text on the phone. Any coaching context must come from a separately reviewed, explicit user choice; an existing cloud journal is no longer an assumed data source. Manual backup/import does not grant AI permission or restore server access to private entries.

## Implement

- Approve the feature, choose/evaluate a provider/model, and add user-owned conversations/messages/request records only now. Keep context permissions separate from analytics consent.
- Retrieve bounded history, challenge/category/progression aggregates and permitted saved reflections with owner checks. Implement authenticated streaming, stable request keys, durable concurrent usage reservations, timeouts and uncertain-outcome recovery.
- Add chat UI, usage limits/cost monitoring, disable switch, response-quality/safety evaluations and context/message deletion. Validate real-device streaming and provider retention disclosures.

## Keep out

- No voice coach, unlimited journal export to a model, unrestricted SQL, vector database or agent framework without demonstrated need.
- No queue for ordinary interactive replies; this phase is independent of Stripe and can be scheduled first.

## Ready to hand off when

- [ ] Feature scope/provider/privacy decisions are approved; quality/context evaluation meets documented targets.
- [ ] Real-device streams, duplicate sends, interruption/cancellation, unknown outcomes and concurrent allowance enforcement pass.
- [ ] Cross-user/context-consent isolation, deletion, prompt-injection handling, latency and cost limits are verified.
- [ ] Record exact changes, issues/fixes and test evidence in the PR descriptions, and file remaining gates as `gate` issues.

## Open gates for Phase 14

Not a first-release gate; schedule separately after launch.
