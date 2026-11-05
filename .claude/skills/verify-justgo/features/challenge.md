# Challenge completion

On Home a user accepts the front card of a venue deck, marks it completed, sees the success screen and saves or skips a reflection. The completion syncs to the account. The reflection stays in the phone's journal and syncs as a journal version, never as attempt text.

## Sub-features

- `challenge-accept` starts the front card and shows `Completed` and `Give up`.
- `challenge-complete` shows the success screen with `That’s a win!`.
- `challenge-reflection` saves reflection text from the `Your reflection` field.
- `challenge-skip` skips the reflection and returns to the deck.
- `challenge-give-up` abandons the card without any write.

## How to get to it (user POV)

- Home deck, button `Accept challenge` (visually labelled `Swipe right`).
- A venue chip in the `Challenge venues` row picks the deck first.

## Driving it with Playwright

Preconditions:

- Doctor is `idle`. Drive: `bin/verify drive challenge`.
- A fresh fixture account from `signInFixture(page)`, with zero attempts.

- **Deck.** After sign-in, button `Accept challenge` is visible. Capture `01-deck`.
- **Accept.** Click `Accept challenge`. Button `Completed` is visible. Capture `02-active`.
- **Complete.** Click `Completed`. Text `That’s a win!` is visible. Capture `03-success`.
- **Reflect.** Click `Continue`, fill label `Your reflection` with a synthetic sentence, and `Save Reflection` is enabled. Capture `04-reflection`.
- **Save.** Click `Save Reflection`. `Accept challenge` is visible again.
- **Side effects.** Poll until `justgo.attempts` has one row for the account with `reflection_text` null, `justgo.journal_versions` has one row, and `localJournalEntries(page, userId)` has one entry with the synthetic text.
- **Progress.** Click tab `Progress`. Test ID `progress-value-reps` reads `1`. Capture `05-progress`.

## Gotchas

- `challenge-skip` and `challenge-give-up` have no drive step. `e2e/local-flow.spec.ts` covers them as regressions.
- The completion POST goes to `/v1/completion-restores`, not `/v1/attempts`. The fence rejects any attempt write that is not a valid create payload.
- The local save finishes before the HTTP acknowledgement. Poll the database. Do not read it once right after `Save Reflection`.
- An eventual assertion can miss a brief wrong frame between screens (the known completion flicker). Record the transition when it is the subject.
