# Account

A user signs in with Apple or Google, sees the active provider on the Account screen, can switch to the other provider, and can log out or delete the account. A switch and logout keep the phone's data and revoke the old session on the server.

## Sub-features

- `account-sign-in` signs in through the provider buttons on Welcome or `/account/sign-in`.
- `account-methods` shows switches `Apple` and `Google`. Only the active provider's switch is on, with `You’re signed in with Apple.` or `Google.` under its label. There is no `Log out` row.
- `account-switch` opens `/account/sign-in` from the off switch. Signing in there makes that provider active and revokes the old app session.
- `account-logout` opens alert dialog `Log out?` from the active switch and revokes the session.
- `account-delete` confirms in alert dialog `Delete your account?` and removes the owner's data.

## How to get to it (user POV)

- Home, link `Open Settings`, then link `Account`. The route is `/recovery`.
- Welcome, button `Sign in with Apple` or `Sign in with Google`.

## Driving it with Playwright

Preconditions:

- Doctor is `idle`. Drive: `bin/verify drive account`.
- A fresh fixture account from `signInFixture(page, { provider: 'apple' })`. It returns a session token kept only in memory.

- **Open Account.** Click link `Open Settings`, then link `Account`. The URL ends in `/recovery`, switch `Apple` is checked and `Google` is not. Capture `01-account-apple`.
- **Switch.** Click switch `Google`. The URL path is `/account/sign-in`, with query `provider=google` and `switchProvider=1`. Capture `02-switch-sign-in`. Click button `Sign in with Google` and wait for the deck. Reopen Account: `Google` is checked and `Apple` is not. Capture `03-account-google`. The first session's `revoked_at` is set.
- **Ask to log out.** Click switch `Google`. Alert dialog `Log out?` is visible. Capture `04-logout-dialog`.
- **Confirm.** Click button `Log out` inside the dialog. Switches `Apple` and `Google` are unchecked and enabled. Capture `05-signed-out`.
- **Proof.** `GET http://127.0.0.1:3000/v1/auth/session` with the first token returns `401`.

## Gotchas

- Sign-in uses the synthetic provider, loaded only through the web journey seam. It says nothing about real Apple or Google OAuth, which needs a physical phone. The same holds for a native provider switch.
- Account has no `Log out` row. The active switch opens the dialog, and `Log out` exists only inside it.
- After the switch the stack holds two Account screens. Scope subtitle text to its switch, or `getByText` matches both.
- The web build keeps credentials in an in-memory vault. A reload loses the session, unlike native Keychain.
- Modal isolation (`inert`, `aria-hidden`) exists only on web. Native VoiceOver scope needs a device check.
- `account-delete` has no drive step. `e2e/account-deletion.spec.ts` covers it, including a lost acknowledgement.
- Accounts created in the pane during `serve` are deleted by `bin/verify stop`. Do not stop the API another way.
