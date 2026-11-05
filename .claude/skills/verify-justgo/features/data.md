# Data download

The Data screen lets a user download all their data as one ZIP and import a previous download. A signed-in download holds the full completion history, the journal and preferences.

## Sub-features

- `data-open` shows heading `Data`.
- `data-download` downloads `README.txt`, `activity.csv`, `data.json` and `journal.json` in one ZIP.
- `data-import` restores a previous download.

## How to get to it (user POV)

- Home, link `Open Settings`, then the `Data` row.
- `/data` directly.

## Driving it with Playwright

Preconditions:

- Doctor is `idle`. Drive: `bin/verify drive data`.
- A fresh fixture account from `signInFixture(page)` with one completion and a synthetic reflection from `completeChallenge(page, text)`.

- **Open Data.** `openData(page)` goes to `/data`. Heading `Data` is visible. Capture `01-data`.
- **Download.** Click button `Download my data` and wait for the browser download. Capture `02-downloaded`.
- **Proof.** Unzip in memory. The ZIP holds exactly the four files, `data.json` names the fixture account as owner, with one attempt and one journal entry.

## Gotchas

- The ZIP contains reflection text. Read it in place and record only file names and counts.
- `data-import` has no drive step. `e2e/journal-backup.spec.ts` covers it.
- A browser download is not Files or iCloud Drive. Those stay physical-device checks.
- Large-history downloads page through the API. `e2e/data-export.spec.ts` seeds 51 previous-month attempts to cover paging.
