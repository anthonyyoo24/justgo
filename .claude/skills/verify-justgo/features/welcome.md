# Welcome and guest entry

A first-time user sees Welcome with Apple and Google sign-in above `Continue`. `Continue` leads to Terms & Privacy, and continuing there opens the challenge deck as a guest whose data stays on the phone. No server account is created.

## Sub-features

- `welcome-actions` shows `Sign in with Apple`, `Sign in with Google` and `Continue`.
- `welcome-terms` shows the `Terms & Privacy` heading with links to the fixture API's legal documents.
- `welcome-guest` opens the deck as a guest collection and creates no `justgo.users` row.

## How to get to it (user POV)

- Open the app for the first time. The route is `/welcome`.

## Driving it with Playwright

Preconditions:

- Doctor is `idle`. Drive: `bin/verify drive welcome`.

- **Welcome.** `page.goto('/welcome')`. Buttons `Sign in with Apple` and `Sign in with Google` are visible and `Continue` is enabled. Capture `01-welcome`.
- **Terms.** Click button `Continue`. Heading `Terms & Privacy` appears. Links `Terms of Service` and `Privacy Policy` point at `http://127.0.0.1:3000/legal/terms` and `/legal/privacy`. Capture `02-terms`.
- **Guest deck.** Click button `Continue`. Button `Accept challenge` is visible. Capture `03-deck`.
- **Proof.** `localStorage['justgo.identity.managed.v1']` holds a `guestId`. The `justgo.users` count is unchanged. Every `/v1/` request went to `http://127.0.0.1:3000`.

## Gotchas

- Two buttons are named `Continue`, one on Welcome and one on Terms. Click the second only after the `Terms & Privacy` heading is visible.
- Guest access depends on the fixture API's disposable guest policy. The deployable `dev:api` server reports access unavailable (README).
- In the pane, the persisted profile can still hold an earlier run's guest identity and journal. Clear the origin first (SKILL.md, Cleanup).
- `e2e/acceptance.spec.ts` also covers layout at 320 and 390 widths and the disclosure copy. Run it for layout changes.
