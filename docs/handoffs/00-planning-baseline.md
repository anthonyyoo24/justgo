# Planning baseline — September 16, 2026

> **Historical v1 record:** Release scope and sequencing below were superseded by [the iOS release scope revision](01-ios-release-scope.md). Use the current PRD, tech spec and v2 plans for implementation; retain this record as history.

**State:** Documentation prepared; no application implementation, migrations, infrastructure provisioning or deployment performed.

## Read first

- [Implementation plan](../IMPLEMENTATION_PLAN.html)
- [Current PRD](../PRD.md), revised September 16, especially sections 11 and 13
- [Tech stack](../TECH_STACK.md), dated September 16
- [Handoff workflow/index](README.md) and [phase template](TEMPLATE.md)

PRD defines product behavior; the tech stack defines architecture. The selected final Paper screen IDs are listed in the PRD. Local screen-refs are inspiration and do not override those screens. CURRICULUM.md is a draft; neither its four courses/300 reps nor illustrated sample counts are approved launch configuration.

## Existing directory and agreed target

At planning time the root contained docs/ and a macOS .DS_Store file. No apps/, packages/, package.json, root Git repository, database migrations or test harness for the application existed. The agreed target is one repository rooted at justgo/, with apps/mobile, apps/api, packages/contracts and docs together. Do not add a code/ wrapper or move docs out of the repository.

## What this planning work added

- docs/IMPLEMENTATION_PLAN.html: ten initial-release phases, two unscheduled optional phases, dependency/decision gates, scope exclusions and browser-local progress export/import.
- docs/handoffs/README.md: phase index and handoff workflow.
- docs/handoffs/TEMPLATE.md: exact change, contract, migration, issue/fix, verification, operations and next-step context.
- docs/handoffs/00-planning-baseline.md: this starting record.
- docs/checks/: focused validation for the HTML planning artifact, not the app’s test suite.
- Links from PRD/tech-stack to the implementation plan; their product/architecture requirements are unchanged.

Browser checklist changes do not write Markdown files. Saved handoffs and actual source/test evidence are authoritative. Every build phase starts Not started; optional Stripe/coach phases are Not scheduled.

## Constraints already agreed

- React Native + Expo + TypeScript; npm workspace. Mobile app → Fastify on Vercel → PostgreSQL hosted by Supabase, through the API only. Shared public contracts; no Supabase Auth added to custom identity.
- No signup; separate device sessions and synchronizing iPhone recovery credential with tested fallbacks. Account ownership is not proven by a purchase receipt.
- Cloud state is authoritative. No durable offline journal or mutation queue. React local UI, Zustand in-memory onboarding edits, TanStack Query server state and Reanimated gesture values have separate roles.
- Published challenges and accepted attempts are distinct. Left swipe browses; right swipe accepts after server confirmation. One active attempt; original deadline survives background/close. Zero awaits an explicit outcome.
- Completion and distinct level credit are atomic and safe to retry. No completed-challenge replay, day notes, automatic give-up, XP or clinical scoring. Settings mockup is not a feature list.
- Five retrospective feeling choices and optional private reflection text/dictation; submitted feedback differs from drafts. New venue/helper content and elapsed-duration totals must appear in eventual contracts.
- Native purchases and immediate server verification; QStash billing delivery plus scheduled handoff repair/provider reconciliation. No Redis/Celery/always-on worker required.
- Stripe web checkout and AI text coach remain later optional work. Coach implementation is independent of Stripe.

## Open decisions / discrepancies to preserve

PRD section 13 is authoritative for onboarding, commercial offer, catalog/venues, deck counter, reflection dismissal, reading/editing reflections, level transitions, access expiry and supporting designs. The HTML decision register assigns the phase each blocks. Do not silently approve proposed defaults.

The tech stack’s introductory wording leaves feeling vocabulary generic; the revised PRD supplies the five exact choices. Its content table does not yet enumerate every venue/helper field; include them when implementing the content schema. Course branching is not automatically in scope. Older files/design explorations and sample values must not expand launch scope.

## Why this sequence

Foundation and credential recovery come first. Native timer/dictation feasibility is checked during identity work before investing in the whole UI. The real challenge loop precedes reflection/history. Native timers and reflection can follow separate paths; both join before billing. Privacy and diagnostics start as boundaries early and are fully validated before release. Do not defer all testing to the release phase.

## Known limits and next action

No app runtime, database or provider configuration has been tested by preparing these documents. Native acceptance requires real devices and development builds. Provider versions/quotas/pricing must be rechecked during implementation. No deadline or throughput claim is made from technology selection alone.

Start phase 01: initialize the root workspace and test harnesses, record the native/version matrix and safe environment setup, and assign the PRD’s open decisions to their blocking phases. Continue identity proof while later content decisions are resolved.

## Planning artifact verification

See [plan-check-results.md](../checks/plan-check-results.md) for the document checks and browser behavior verification. These results verify the planning tool only; they do not mark any implementation phase complete.
