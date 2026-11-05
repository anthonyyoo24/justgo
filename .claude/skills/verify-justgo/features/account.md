# Account

A user signs in with Apple or Google, sees the linked methods on the Account screen and can log out or delete the account. Logout keeps the phone's data and revokes the session on the server.

## Sub-features

- `account-sign-in` signs in through the provider buttons on Welcome or `/account/sign-in`.
- `account-methods` shows switches `Apple` and `Google` reflecting linked methods.
- `account-logout` confirms in alert dialog `Log out?` and revokes the session.
- `account-delete` confirms in alert dialog `Delete your account?` and removes the owner's data.

## How to get to it (user POV)

- Home, link `Open Settings`, then link `Account`. The route is `/recovery`.
- Welcome, button `Sign in with Apple` or `Sign in with Google`.

## Driving it with Playwright

Preconditions:

- Doctor is `idle`. Drive: `bin/verify drive account`.
- A fresh fixture account from `signInFixture(page)`. It returns a session token kept only in memory.

- **Open Account.** Click link `Open Settings`, then link `Account`. The URL ends in `/recovery` and switch `Apple` is checked. Capture `01-account`.
- **Ask to log out.** Click button `Log out`. Alert dialog `Log out?` is visible. Capture `02-logout-dialog`.
- **Confirm.** Click button `Log out` inside the dialog. Switches `Apple` and `Google` are unchecked and enabled. Capture `03-signed-out`.
- **Proof.** `GET http://127.0.0.1:3000/v1/auth/session` with the old token returns `401`.

## Gotchas

- Sign-in uses the synthetic provider, loaded only through the web journey seam. It says nothing about real Apple or Google OAuth, which needs a physical phone.
- The page has two `Log out` buttons once the dialog opens. Scope the second click to the dialog.
- The web build keeps credentials in an in-memory vault. A reload loses the session, unlike native Keychain.
- Modal isolation (`inert`, `aria-hidden`) exists only on web. Native VoiceOver scope needs a device check.
- `account-delete` has no drive step. `e2e/account-deletion.spec.ts` covers it, including a lost acknowledgement.
- Accounts created in the pane during `serve` are deleted by `bin/verify stop`. Do not stop the API another way.
