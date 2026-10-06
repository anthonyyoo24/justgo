# Repository folder structure

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
