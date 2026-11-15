# Phase 13A plan for one journal per phone

**Status.** Planned on November 14, 2026. Nothing in this plan has run. Anthony made its [decisions](#anthonys-decisions) the same day. It changes no provider setting, database, legal text or build by itself.

Phase 13 gave the phone one journal and optional Apple and Google accounts, but it still treats each account as a separate person. Signing in with a different account opens that account's journal and parks the phone's entries. Import asks for the account that owns the file, and the Apple and Google switches on Account change which account is active instead of joining them. On November 14 this blocked Anthony on build 8: the phone's journal belonged to his Google account, so import sent him to sign in, and his Apple sign-in was refused with an error that vanished.

This plan assumes one person uses the phone, whether as a guest, with Apple or with Google.

## What the user gets

- **One journal per phone.** Guest, Apple and Google all see and change the same history. Signing in, signing out and switching providers never lock it.
- **Signing in brings the journal along.** Whichever provider the user signs in with, the phone's history attaches to that account and syncs.
- **A new phone gets the history back.** On a new phone, signing in with Apple or Google downloads the account's saved history. This is the main acceptance test.
- **Apple and Google become one account.** Turning on the second provider's switch on Account links it to the same account.
- **Import always works**, signed in or not.
- **Signing out keeps the history on the phone, unlocked.**

## Anthony's decisions

Anthony made these choices on November 14, 2026.

- **One person.** "We're assuming the same person owns all. Whether they're a guest or they're logged in with Apple or Google, it's the same person."
- **New phone.** "They can just sign in with their Google or Apple account, and it'll have all their saved history. They can see it in the app on the new phone."
- **Linking.** The Login methods switches are enough, with no separate Add Apple or Add Google button. Turning on the second switch while signed in links that provider, and both switches show on. Turning off one of two linked switches unlinks it. Turning off the only one logs out. This replaces the November 2, 2026 decision in [Account sync setup](../operations/ACCOUNT_SYNC_SETUP.md#link-identities-and-allow-browser-origins) that the switches show only the active provider and never link.
- **Merge.** When the phone has history and the account it signs into already has server history, the app keeps both. The phone's entries are added to the account's.
- **Delete-all.** Delete-all still asks the user to sign in when signed out. Import, export and viewing need no sign-in.

## Design

### The phone journal

The phone keeps one current collection, stored under `justgo:v1:<ownerId>` (`apps/mobile/src/data/activity/repository.ts`). Its owner is a guest id or an account id. The plan keeps that storage and changes who may use it.

- **Signed out.** The current collection stays readable and writable, as today. Import writes into it too. Entries saved or imported while signed out upload at the next sign-in.
- **Sign-in to the same account.** Nothing moves. The account's sync resumes and uploads what changed while signed out.
- **Sign-in to any other account.** The phone collection is adopted into that account, the way guest adoption works today, and the source is retired only after the copy saves. Today `mergeGuestData` in `apps/mobile/src/app-support/providers/activity-runtime.ts` adopts only a guest source. It changes to adopt whatever collection is current, guest or account.
- **Account with server history.** Adoption downloads the account's history first, adds the phone's entries, then uploads the phone's entries through `/v1/completion-restores`, as ordinary sync does. Identical records stay single and differing journal versions are both kept, as import does today.
- **Account deletion.** Unchanged. It erases the signed-in account's collection and starts a new guest one.

`ProviderSignInScreen` no longer asks for "the account that owns this phone's saved data". The `expectedOwnerId` check in `managed-controller.ts`, which runs after the server has already created a session and shows a generic error that `retry()` then clears, goes away with the `ownerId` route parameter.

### Linking Apple and Google

Linking uses Supabase's manual identity linking, which [Account sync setup](../operations/ACCOUNT_SYNC_SETUP.md#link-identities-and-allow-browser-origins) already enables. The signed-in user calls `linkIdentity` for the second provider, so both identities belong to one Auth user. `managed_auth_accounts` maps one Auth user to one JustGO user, so a linked identity signs in to the same JustGO account with no server or database change. `linkProvider` and `unlinkProvider` already exist in `managed-controller.ts` and `managed-auth.ts`, and no screen calls them yet.

- Linking happens only from a signed-in session, by the user's tap. Nothing links by email, and API code still never reads one.
- The Login methods switches show linked identities, not the active provider.
- Unlinking keeps at least one identity. Turning off the last one opens the existing logout dialog.
- **Conflict.** An Apple ID or Google account that already has its own JustGO account cannot be linked, because Supabase refuses an identity that belongs to another Auth user. The switch stays off and says the account already exists separately. Combining two existing accounts on the server is out of scope here ([open question 1](#open-questions)).
- The switch-provider path (`switchProvider=1` and its switch proof) leaves the switches. The controller keeps finishing a switch already saved on a phone, as the logout rule in `AGENTS.md` requires.

### What stays

- Delete-all asks for sign-in when signed out, and it deletes the signed-in account's server copy and the phone journal. Returning from that sign-in still never deletes by itself.
- Logout revokes the app session before the provider SDK signs out.
- Query keys stay account-scoped through `accountKey()`, so the cache never serves one account's server data to another.
- Admission metadata never copies in adoption, import or backups.
- The cloud-sync sentence on Welcome and the provider sign-in screen stays word for word (`scripts/quality/policy-copy.test.mjs`).

## PRs

Each PR carries its code, tests and doc updates, and lands on its own. PRs that share a file merge one at a time.

| PR                            | Change                                                                                                                                                                                                                                                                                                                               | Sensitive |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 1. This plan                  | This file and its row in the [plan index](README.md).                                                                                                                                                                                                                                                                                | No        |
| 2. Import always works        | Drop the sign-in gate for import in `SettingsDataScreen.tsx`. `ActivityRuntime.importData()` accepts any valid backup into the current collection while signed out, and the next sign-in uploads it. `apps/mobile/src/data/backup/data-backup.ts` stops binding an account backup to the same account id. Delete-all keeps its gate. | Yes       |
| 3. Sign-in brings the journal | Adopt the current collection, guest or account, into whichever account signs in. Remove the `expectedOwnerId` check and the `ownerId` sign-in parameter, and change the sign-in copy. Run [`verify-delete-all-retry`](../../.claude/skills/verify-delete-all-retry/SKILL.md), since the change touches `mergeGuestData`.             | Yes       |
| 4. Switches link              | The Login methods switches call `linkProvider` and `unlinkProvider` and show linked identities, with the conflict message. Replace the November 2 decision in [Account sync setup](../operations/ACCOUNT_SYNC_SETUP.md).                                                                                                             | Yes       |
| 5. Legal text                 | Privacy Policy clauses on signing into another account and on account-owned import files, plus `DATA_INVENTORY.md` and `apps/api/src/http/legal-drafts.ts`. Anthony approves the text, and it publishes with the build that carries PRs 2 to 4.                                                                                      | Yes       |

PRs 2 and 4 can run side by side. PR 3 follows PR 2, because both touch `activity-runtime.ts` and the import path. PR 4 and PR 3 both touch `managed-controller.ts`, so the second of them rebases on the first.

### Tests and rules that change

These cases pin today's behavior and change with the PR that changes it:

- `apps/mobile/src/app-support/identity/auth/managed-controller.test.ts`: the cases for a different account opening its own collection, the `expectedOwnerId` refusal and the switch-provider path.
- `apps/mobile/src/app-support/providers/activity-runtime.managed.test.ts`: guest-only adoption, and import refused for an account collection outside cloud mode.
- `apps/mobile/src/features/settings/data/SettingsDataScreen.test.tsx`: import sending the user to sign in. The delete-all sign-in return case stays.
- `apps/mobile/src/app-support/identity/account/ManagedAccountScreen.test.tsx`: switches showing the active provider.
- `e2e/identity-catalog.spec.ts`: the journeys that sign into a second account and expect a separate journal.

These `AGENTS.md` rules change with them: "Data actions wait for the user" (import no longer needs the owner's sign-in), the two guest adoption rules (they cover any phone collection). The logout, `accountKey()`, email and admission rules stay.

### Privacy Policy wording

Two clauses in [PRIVACY_POLICY_DRAFT.md](../legal/PRIVACY_POLICY_DRAFT.md) describe the old behavior and need Anthony's approval to change:

- "Signing into another account does not automatically copy the previous account’s data." The new behavior copies the phone's journal into whichever account signs in.
- "Account-owned files require sign-in to the same account; possession of a file does not authenticate you." The new behavior imports any valid file into the phone's journal, and only the signed-in account syncs it.

PR 5 proposes the replacement sentences. The rest of the policy stays.

## Acceptance

Each PR proves its own behavior with focused tests and a `verify-justgo` drive. The build that carries PRs 2 to 5 then passes these on a physical iPhone, filed as a `gate` issue:

1. **New phone.** With history saved under Google, delete the app, reinstall it and sign in with Google. The full history shows.
2. **Linked provider.** Link Apple on Account, sign out, sign in with Apple. The same history shows, and Account shows both switches on.
3. **Signed-out import.** Sign out, import a build 7 export, then sign in. The entries show and reach the server. Read the counts back from `justgo.attempts` and `justgo.journal_versions`.
4. **Merge.** On a phone with guest history, sign in to an account with server history. Both sets show, with no duplicates.
5. **Conflict.** Turn on a provider whose identity already has its own JustGO account. The switch stays off with the conflict message, and nothing is lost.

## Risks

- **Data loss in adoption.** Adoption copies first and retires the source only after the copy saves, as guest adoption does today. The adoption cases in `activity-runtime.managed.test.ts` keep that order.
- **Delete-all and epochs.** An account's delete-all from another device still clears the phone's copy of that account through its data epoch. Adoption must not upload entries the account's own delete-all removed. The `verify-delete-all-retry` model covers it.
- **Shared phones.** Anyone holding the phone sees and can sync its history into their own account. Anthony accepted this on November 14, because one person uses the phone.
- **Anthony's own accounts.** Build 8 already created separate Google and Apple accounts for him in the U.S. project, so linking them would hit the conflict. Before the acceptance run, one of them needs to be deleted, which is a hosted data change that waits for his go.

## Open questions

1. **Combining two existing accounts.** Should the app merge two JustGO accounts that each signed in separately, with proof of both sessions? That needs an API route and a sensitive server change. It is not part of this plan.
