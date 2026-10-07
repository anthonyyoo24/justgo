# Repository folder structure

The owner-authorized cleanup is split into foundation and mobile PRs for review.
This guide shows the final structure after **both** land. In the foundation stage,
mobile source and artwork still use their merged-07.3 locations; tooling, API tests,
contracts and documentation already use the groups below. See the
[cleanup handoff](../handoffs/project-folder-cleanup.md) for sequencing and checks.

The October 6 dedicated cleanup groups existing files by responsibility. Tests
remain beside their implementations. Route paths, public package exports,
storage envelopes, API behavior and artwork pixels are unchanged. The
[cleanup handoff](../handoffs/project-folder-cleanup.md) records verification and
the preceding phase's open acceptance gates.

## Mobile source

```text
apps/mobile/src/
├── app/                              Expo Router route files and layouts
├── app-support/
│   ├── access/                       startup access gate
│   ├── identity/                     account/recovery coordination and credentials
│   ├── providers/                    app, account and activity lifecycle composition
│   └── saving/                       shared saving notices and recovery feedback
├── features/
│   ├── challenges/
│   │   ├── ChallengeScreen.tsx       Home screen orchestration
│   │   ├── controller.ts             venue/deck state and accepted completion context
│   │   ├── ChallengeLayout.tsx        shared challenge screen layout
│   │   ├── challenge-design.ts        existing challenge design helpers
│   │   ├── deck/                     cards, venue selection, artwork and deck motion
│   │   │   ├── ChallengeDeck.tsx
│   │   │   ├── VenueTabs.tsx
│   │   │   ├── VenueArt.tsx
│   │   │   └── deck-model.ts
│   │   ├── active/                   unfinished challenge, full-screen modal and timer
│   │   │   ├── ActiveChallenge.tsx
│   │   │   ├── ActiveChallengeModal.tsx
│   │   │   ├── useActiveChallenge.ts
│   │   │   └── countdown.ts
│   │   └── success/                  completed challenge confirmation
│   │       ├── SuccessScreen.tsx
│   │       └── SuccessView.tsx
│   ├── reflections/                  reflection screen, form and feeling presentation
│   └── progress/
│       ├── ProgressScreen.tsx        query and navigation coordination
│       ├── ProgressView.tsx          calendar/day-detail composition
│       ├── calendar.ts               shared date and calendar helpers
│       ├── calendar/                 calendar UI and loading presentation
│       └── day-details/              day sheet and activity/reflection rows
├── data/activity/
│   ├── accounts.ts                   account repository ownership
│   ├── repository.ts                 activity storage/submission/sync orchestration
│   ├── model.ts                      shared journal schemas and controllable interfaces
│   ├── submissions.ts                completion/reflection domain transitions
│   ├── persistence/                  AsyncStorage adapter and serialized writes
│   └── sync/                         delivery, acknowledgements, transport and retries
├── components/                       reusable visual building blocks
├── lib/
│   ├── network/                      HTTP transport and coordinated account client
│   ├── deadline.ts                   shared I/O deadline helper
│   ├── telemetry.ts                  consent-aware telemetry boundary
│   └── useDelayedBusy.ts             delayed saving-feedback helper
├── platform/
│   ├── connectivity/                 native/browser connectivity adapters
│   ├── toast/                        native/browser notification adapters
│   └── modals/                       native/browser modal isolation adapters
├── theme/                            design tokens
└── dev/previews/
    ├── ScreenPreview.tsx             guarded developer screen presentation
    └── challenges/                   challenge preview and synthetic card copy
```

The diagram omits colocated `*.test.ts` / `*.test.tsx` files. Native and `.web.*`
implementations stay in the same adapter folder so platform resolution continues
to work. The feature's card presentation is shared by deck browsing and the
active challenge; moving it into `deck/` does not duplicate it.

Mobile assets keep application icons at `apps/mobile/assets/`; challenge artwork
uses `assets/challenges/venues/` for six venue/color pairs and
`assets/challenges/decoration/` for the paper texture and lower flourish. The
native Keychain module remains under `apps/mobile/modules/justgo-keychain/`.

## API, contracts and verification

```text
apps/api/
├── src/                              existing API capability/service boundaries
├── tests/
│   ├── app.test.ts                   application wiring and deployment guards
│   ├── http-errors.test.ts           HTTP error contract behavior
│   ├── activity/                     challenges, attempts, reflections and Progress
│   ├── identity/                     identity policies and real session transactions
│   ├── database/                     database/migration safety and rehearsal checks
│   │   └── fixtures/                 recorded hashes for already-applied migrations
│   └── harness/                      disposable fixture startup/shutdown safeguards
├── scripts/                          API operations and isolated fixture servers
└── drizzle/                          ordered migrations and generated metadata

packages/contracts/src/
├── index.ts                          unchanged public @justgo/contracts entrypoint
├── identity.ts                       account, session and recovery contracts
├── access.ts                         paid-access contracts
├── openapi.ts                        API specification composed from the contracts
├── activity/                         canonical challenge/attempt/reflection/Progress contracts
└── legacy/                           temporary compatibility contracts, retained until 07.5

scripts/
├── local-database.mjs                loopback database provisioning/lifecycle
├── quality/                         coverage, architecture and upload-allowlist checks
├── journeys/                        saved journey runner/build/environment checks
└── design/                          original artwork extraction and palette adaptation

e2e/
├── *.spec.ts                         existing saved app/API/database cases
├── playwright.config.ts             existing browser runner configuration
└── support/                         shared fixtures, environment and repository entrypoint
```

App-specific native automation remains in `apps/mobile/e2e/`. Browser testing and
legacy compatibility code are organized here but retained: their replacement or
removal is still owned by 07.3A and 07.5, respectively. No dependency or CI gate
was retired by this cleanup.

## Documentation and evidence

```text
docs/
├── IMPLEMENTATION_PLAN.md            phase sequencing and acceptance gates
├── DECISIONS.md                      decision register
├── product/                         PRD, challenge content, curriculum and scope
├── architecture/                    app shell, tech stack, identity and folder guidance
├── design/                          design guide and challenge fidelity measurements
├── operations/                      setup, testing, release and event guidance
├── handoffs/                        phase records and their chronological index
├── checks/
│   └── phase-07-3/
│       ├── browser/                  historical browser screenshots
│       └── simulator/                historical iOS Simulator screenshots
├── design-source/                   source measurements and extracted design references
└── screen-refs/                     visual inspiration collection
```

Keep the phase plan and handoff index as stable entrypoints. Root/package tool
configuration, ordered migrations, small cohesive features and existing reference
collections remain flat. Add another folder when an implemented responsibility
needs it; avoid empty future folders or a mandatory screen/component/hook taxonomy.

## Complete created and moved file diagram

This snapshot covers merged phase 7.3 (`3e41330` → `6bccfde`) and the dedicated
cleanup rebased onto that merge. It lists **all 152 distinct new or moved files**, including
tests, artwork and verification images, at their current cleanup-branch locations.
There are **43 phase additions**, **5 cleanup additions** and **133 moves**;
29 phase additions also appear among the moves, so they are listed once.

- **`new in 7.3`**: created during the phase implementation.
- **`new in cleanup`**: created for the organization, guidance or verification work.
- **`moved`**: relocated during cleanup, including any necessary import updates.
- **`7.3 folder` / `cleanup folder`**: a directory first present in that slice.
  Other directories provide the existing parent structure.

[PR #16](https://github.com/anthonyyoo24/justgo/pull/16) contains the phase changes
at their original locations. The cleanup remains a separate branch and PR based on merged `main`.
The earlier overview explains each responsibility group; this tree expands every
new or relocated file instead of omitting tests and images.

```text
justgo/
├── apps/
│   ├── api/
│   │   └── tests/
│   │       ├── activity/ [cleanup folder]
│   │       │   ├── attempts.integration.test.ts [moved]
│   │       │   ├── challenges.integration.test.ts [moved]
│   │       │   ├── progress.integration.test.ts [moved]
│   │       │   └── reflections.integration.test.ts [moved]
│   │       ├── database/ [cleanup folder]
│   │       │   ├── fixtures/ [cleanup folder]
│   │       │   │   └── applied-migration-hashes.json [moved]
│   │       │   ├── database.integration.test.ts [moved]
│   │       │   ├── migration-metadata.test.ts [moved]
│   │       │   ├── migrations.integration.test.ts [moved]
│   │       │   └── rehearsal-target.test.ts [moved]
│   │       ├── harness/ [cleanup folder]
│   │       │   ├── challenge-fixture.test.ts [moved]
│   │       │   └── fixture-shutdown.test.ts [moved]
│   │       └── identity/ [cleanup folder]
│   │           ├── identity.integration.test.ts [moved]
│   │           └── identity.test.ts [moved]
│   └── mobile/
│       ├── assets/
│       │   └── challenges/
│       │       ├── decoration/ [cleanup folder]
│       │       │   ├── lower-flourish.png [moved]
│       │       │   └── paper-texture.png [moved]
│       │       └── venues/ [cleanup folder]
│       │           ├── bars-cream.png [moved]
│       │           ├── bars.png [moved]
│       │           ├── bookstore-cream.png [moved]
│       │           ├── bookstore.png [moved]
│       │           ├── cafe-cream.png [moved]
│       │           ├── cafe.png [moved]
│       │           ├── gym-cream.png [moved]
│       │           ├── gym.png [moved]
│       │           ├── park-cream.png [moved]
│       │           ├── park.png [moved]
│       │           ├── streets-cream.png [moved]
│       │           └── streets.png [moved]
│       ├── src/
│       │   ├── app-support/
│       │   │   ├── providers/
│       │   │   │   ├── activity-runtime.test.ts [new in 7.3]
│       │   │   │   └── activity-runtime.ts [new in 7.3]
│       │   │   └── saving/ [7.3 folder]
│       │   │       ├── presentation.ts [new in 7.3]
│       │   │       ├── SavingFeedback.test.tsx [new in 7.3]
│       │   │       ├── SavingFeedback.tsx [new in 7.3]
│       │   │       └── SavingNotice.tsx [new in 7.3]
│       │   ├── data/
│       │   │   └── activity/
│       │   │       ├── persistence/ [cleanup folder]
│       │   │       │   ├── persistence.ts [moved]
│       │   │       │   ├── storage.test.ts [moved]
│       │   │       │   └── storage.ts [moved]
│       │   │       └── sync/ [cleanup folder]
│       │   │           ├── delivery.ts [moved]
│       │   │           ├── retry.ts [moved]
│       │   │           ├── sender.test.ts [moved]
│       │   │           ├── sender.ts [moved]
│       │   │           ├── transport.test.ts [moved]
│       │   │           └── transport.ts [moved]
│       │   ├── dev/
│       │   │   └── previews/
│       │   │       └── challenges/ [cleanup folder]
│       │   │           ├── DeckPreview.test.ts [moved]
│       │   │           ├── DeckPreview.test.tsx [moved]
│       │   │           ├── DeckPreview.tsx [moved]
│       │   │           └── preview-copy.ts [moved]
│       │   ├── features/
│       │   │   ├── challenges/
│       │   │   │   ├── active/ [cleanup folder]
│       │   │   │   │   ├── ActiveChallenge.test.tsx [moved]
│       │   │   │   │   ├── ActiveChallenge.tsx [moved]
│       │   │   │   │   ├── ActiveChallengeModal.tsx [new in 7.3, moved]
│       │   │   │   │   ├── countdown.test.ts [moved]
│       │   │   │   │   ├── countdown.ts [moved]
│       │   │   │   │   ├── useActiveChallenge.test.tsx [new in 7.3, moved]
│       │   │   │   │   └── useActiveChallenge.ts [new in 7.3, moved]
│       │   │   │   ├── deck/ [cleanup folder]
│       │   │   │   │   ├── ChallengeDeck.test.tsx [moved]
│       │   │   │   │   ├── ChallengeDeck.tsx [moved]
│       │   │   │   │   ├── deck-model.test.ts [moved]
│       │   │   │   │   ├── deck-model.ts [moved]
│       │   │   │   │   ├── VenueArt.test.tsx [moved]
│       │   │   │   │   ├── VenueArt.tsx [moved]
│       │   │   │   │   ├── VenueTabs.test.tsx [moved]
│       │   │   │   │   └── VenueTabs.tsx [moved]
│       │   │   │   └── success/ [cleanup folder]
│       │   │   │       ├── SuccessScreen.test.tsx [moved]
│       │   │   │       ├── SuccessScreen.tsx [moved]
│       │   │   │       ├── SuccessView.test.tsx [moved]
│       │   │   │       └── SuccessView.tsx [moved]
│       │   │   └── progress/
│       │   │       ├── calendar/ [cleanup folder]
│       │   │       │   ├── ProgressCalendar.tsx [moved]
│       │   │       │   ├── ProgressSkeleton.test.tsx [moved]
│       │   │       │   └── ProgressSkeleton.tsx [moved]
│       │   │       └── day-details/ [cleanup folder]
│       │   │           ├── DaySheet.test.tsx [moved]
│       │   │           ├── DaySheet.tsx [moved]
│       │   │           ├── ProgressEntryRow.test.tsx [moved]
│       │   │           └── ProgressEntryRow.tsx [moved]
│       │   ├── lib/
│       │   │   ├── network/ [cleanup folder]
│       │   │   │   ├── account-client.test.ts [moved]
│       │   │   │   ├── account-client.ts [moved]
│       │   │   │   ├── http-journal.test.ts [moved]
│       │   │   │   ├── http-methods.test.ts [moved]
│       │   │   │   └── http.ts [moved]
│       │   │   ├── useDelayedBusy.test.tsx [new in 7.3]
│       │   │   └── useDelayedBusy.ts [new in 7.3]
│       │   └── platform/ [7.3 folder]
│       │       ├── connectivity/ [cleanup folder]
│       │       │   ├── connectivity.test.ts [new in 7.3, moved]
│       │       │   ├── connectivity.ts [new in 7.3, moved]
│       │       │   ├── connectivity.web.test.ts [new in 7.3, moved]
│       │       │   └── connectivity.web.ts [new in 7.3, moved]
│       │       ├── modals/ [cleanup folder]
│       │       │   ├── useModalIsolation.ts [new in 7.3, moved]
│       │       │   ├── useModalIsolation.web.test.tsx [new in 7.3, moved]
│       │       │   └── useModalIsolation.web.ts [new in 7.3, moved]
│       │       └── toast/ [cleanup folder]
│       │           ├── Toast.test.tsx [new in 7.3, moved]
│       │           ├── Toast.tsx [new in 7.3, moved]
│       │           ├── Toast.web.test.tsx [new in 7.3, moved]
│       │           └── Toast.web.tsx [new in 7.3, moved]
│       ├── test-support/
│       │   ├── challenge-catalog.ts [new in 7.3]
│       │   └── journey-storage.ts [new in 7.3]
│       └── metro.config.mjs [new in 7.3]
├── docs/
│   ├── architecture/ [cleanup folder]
│   │   ├── APP_SHELL.md [moved]
│   │   ├── FOLDER_STRUCTURE.md [new in cleanup]
│   │   ├── FRONTEND_ARCHITECTURE_LEARNING_MAP.md [moved]
│   │   ├── IDENTITY.md [moved]
│   │   └── TECH_STACK.md [moved]
│   ├── checks/
│   │   ├── phase-07-3/ [7.3 folder]
│   │   │   ├── browser/ [cleanup folder]
│   │   │   │   ├── active-exclusive.jpg [new in 7.3, moved]
│   │   │   │   ├── active-retained-notice.jpg [new in 7.3, moved]
│   │   │   │   ├── correction-active.jpg [new in 7.3, moved]
│   │   │   │   ├── home.jpg [new in 7.3, moved]
│   │   │   │   ├── pr16-dependency-progress.jpg [new in 7.3, moved]
│   │   │   │   ├── pr16-review-reflection.jpg [new in 7.3, moved]
│   │   │   │   ├── recovery-home.jpg [new in 7.3, moved]
│   │   │   │   ├── transition-browser-home.png [new in 7.3, moved]
│   │   │   │   ├── warning-reflection.jpg [new in 7.3, moved]
│   │   │   │   └── warning-sheet.jpg [new in 7.3, moved]
│   │   │   └── simulator/ [cleanup folder]
│   │   │       ├── native-active.png [new in 7.3, moved]
│   │   │       ├── native-home.png [new in 7.3, moved]
│   │   │       └── native-transition-comparison.png [new in 7.3, moved]
│   │   ├── project-folder-cleanup/ [cleanup folder]
│   │   │   ├── browser/ [cleanup folder]
│   │   │   │   └── day-details.jpg [new in cleanup]
│   │   │   └── simulator/ [cleanup folder]
│   │   │       └── home.png [new in cleanup]
│   │   └── phase-07-3a-browser-testing-assessment.md [new in 7.3]
│   ├── design/ [cleanup folder]
│   │   ├── CHALLENGE_FIDELITY.md [moved]
│   │   └── DESIGN.md [moved]
│   ├── handoffs/
│   │   ├── phase-07-3-local-flow.md [new in 7.3]
│   │   └── project-folder-cleanup.md [new in cleanup]
│   ├── operations/ [cleanup folder]
│   │   ├── APPLE_SETUP.md [moved]
│   │   ├── FOUNDATION.md [moved]
│   │   ├── SHIPATON_PLAYBOOK.md [moved]
│   │   └── TESTING.md [moved]
│   └── product/ [cleanup folder]
│       ├── CHALLENGES.md [moved]
│       ├── CURRICULUM.md [moved]
│       ├── PHASE_04_SCOPE.md [moved]
│       └── PRD.md [moved]
├── e2e/
│   ├── support/ [cleanup folder]
│   │   ├── activity-entry.ts [moved]
│   │   ├── environment.ts [moved]
│   │   └── fixtures.ts [moved]
│   └── local-flow.spec.ts [new in 7.3]
├── packages/
│   └── contracts/
│       └── src/
│           ├── activity/ [cleanup folder]
│           │   ├── attempts.test.ts [moved]
│           │   ├── attempts.ts [moved]
│           │   ├── challenges.test.ts [moved]
│           │   ├── challenges.ts [moved]
│           │   ├── progress.test.ts [moved]
│           │   ├── progress.ts [moved]
│           │   ├── reflections.test.ts [moved]
│           │   └── reflections.ts [moved]
│           └── legacy/ [cleanup folder]
│               ├── legacy-challenges.ts [moved]
│               ├── legacy-progress.ts [moved]
│               └── legacy-reflections.ts [moved]
└── scripts/
    ├── journeys/ [cleanup folder]
    │   ├── build-journey-repository.mjs [moved]
    │   ├── journey-environment.test.mjs [moved]
    │   ├── journey-metro.test.mjs [new in 7.3, moved]
    │   └── run-journey.mjs [moved]
    └── quality/ [cleanup folder]
        ├── check-coverage.mjs [moved]
        ├── check-coverage.test.mjs [moved]
        ├── contract-upload.test.mjs [new in cleanup]
        ├── coverage-thresholds.json [moved]
        ├── import-boundaries.mjs [moved]
        ├── import-boundaries.test.mjs [moved]
        └── mobile-verification.test.mjs [new in 7.3, moved]
```
