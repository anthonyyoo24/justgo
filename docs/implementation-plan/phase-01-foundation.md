<a id="phase-01"></a>

# Phase 01 — Foundation & implementation decisions

**Status:** Complete

## Outcome

A reproducible workspace and a clear list of decisions to settle before each feature.

## Decisions in force

- Dependencies: None
- Acceptance: PRD §§2, 10, 13 · Tech §§2, 3, 12
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Create the root npm workspace: apps/mobile, apps/api and packages/contracts, alongside docs. Add strict TypeScript, one lockfile, lint/format commands, CI and environment examples without secrets.
- Scaffold Expo development builds and a Fastify health endpoint on Vercel. Configure PostgreSQL, Drizzle migrations, a separate migration connection, a small reused runtime pool, restricted roles and transaction-local ownership policies.
- Record the compatible Expo/React Native/Reanimated/Worklets/sheet versions, Node LTS and minimum iOS version; record Android constraints without implementing Android yet. Add mobile/API/database/native test harnesses and redacted diagnostics.
- Use the selected Paper screens as the visual reference; extract usable illustrations/icons/fonts and record reusable color, type and spacing values. Adapt only the approved scope changes (no Levels navigation or Dictate button; manual venue filters now belong to phase 04); keep the Progress content. Record remaining decisions with their blocking phases.
- Create `docs/design/DESIGN.md`: a concise design guide identifying the authoritative Paper screens, typography, colors, spacing and shared component styles. Document design decisions and unresolved details.
- Create `apps/mobile/src/theme/tokens.ts`: Define typed, reusable colors, typography, spacing and corner radii from the approved screens for app components to import. Keep these values authoritative in code; no separate JSON token file is needed initially.
- Begin the [Apple/RevenueCat setup checklist](../operations/APPLE_SETUP.md#release-setup-sequence) in parallel. Record account access and outstanding verification; do not wait until the app is finished to start enrollment or product setup.

## Keep out

- Do not build every schema or screen upfront, or provision coach/Stripe infrastructure.
- Do not introduce a code/ wrapper, Supabase Auth, direct client database access, or a second styling framework.

## Ready to hand off when

- [x] A clean checkout can install, type-check, lint and run starter tests using documented commands.
- [x] An iOS development build launches; a deployed staging API can reach PostgreSQL through the intended runtime role.
- [x] Version matrix, environment setup, final-design references and decision owners are recorded.
- [x] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; link it from the handoff index.

## Open gates for Phase 11

None; required foundation gates are complete.
