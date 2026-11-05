# JustGO verification map

This directory is the maintained source for verifying JustGO's user-facing behavior on the web build. Read the index, then use the matching feature file as the recipe. [SKILL.md](../SKILL.md) owns launch, doctor, evidence and cleanup.

## Baseline preconditions

- The checkout's `bin/verify doctor` reports `idle` before a scripted drive, or `serving` before pane work.
- Postgres `justgo_test` is migrated. Migrations seed the six venue decks.
- Each drive starts from a fresh browser context and its own fixture account or guest collection.
- Viewport 390x844, reduced motion, Chromium. These are the journey defaults.

## Driving conventions

- Scripted: `bin/verify drive <feature>`, where `<feature>` is the file name in `../drives/` without `.spec.ts`.
- Pane: the same role and name handles through `find` and `computer`, against `bin/verify serve`.
- Locate by ARIA role and exact accessible name. The only test IDs used are `progress-value-reps` and `day-sheet-entry-list`.
- Enter only synthetic text. Never use real accounts, staging or production.

## Proof and skip reporting

- Each feature writes numbered masked screenshots, masked ARIA trees and `proof.json` under `.local/verify-justgo/<run-id>/<feature>/`.
- `proof.json` names the entry point it used and the side effects it read back.
- A sub-feature without a drive step is unverified. Report it as skipped with the reason. Do not report it as verified through another path.
- A saved journey under `e2e/` that covers a sub-feature is regression evidence, not a capture. Name it separately.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, then exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright`, `Gotchas`.

## Features

- [Welcome and guest entry](./welcome.md) covers provider buttons, Terms & Privacy and guest entry without an account.
- [Challenge completion](./challenge.md) covers accepting a card, completing it and saving a reflection.
- [Progress](./progress.md) covers rep totals, the calendar day sheet and inline reflections.
- [Account](./account.md) covers fixture sign-in, the Account screen and logout.
- [Data download](./data.md) covers the Data screen and the ZIP download.
