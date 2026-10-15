# Phase 08 — Reflection keyboard layout

## Scope and isolation

Anthony requested the reflection keyboard correction in a separate worktree and
its own development server on October 14, 2026. Branch
`codex/phase-08-reflection-keyboard` starts from Phase 08 commit `79aaf39`.
The original Phase 08 checkout, its unstaged work and server on port 8084 remain
owned by the other conversation. After physical-phone acceptance, Anthony
explicitly authorized a local commit and merge into `codex/phase-08-settings-privacy`.
No push or PR is authorized by this task.
Ignored dependency folders were cloned locally and local environment files copied
without printing their contents; native dependencies/configuration are unchanged.

## Behavior

- Focusing the full-screen reflection editor brings its heading near the top of
  the scroll viewport. Measured layout/content changes and the native keyboard's
  shown event retry positioning after the keyboard reduces available space.
- Trailing scroll space lets the final section reach that position. The editor
  has a bounded height, reduced for the available viewport, and retains native
  multiline scrolling for long reflections. Extremely constrained layouts remain
  scrollable with a minimum usable editor height.
- Skip/Save stays in a separate footer above the keyboard; the footer cannot
  shrink into the writing area. Optionality, validation, explicit save, dirty-close
  choices and controller/storage behavior are unchanged.
- Focus scrolling follows the existing effective Reduce Motion preference. Late
  keyboard events after blur cannot reposition the page; listeners are removed
  on unmount. Keyboard dismissal does not explicitly reset the scroll position.

`useReflectionKeyboard` owns focus, measurements and native observation beside
`ReflectionView`; no app/provider or data boundary changes are required.

## Verification and remaining acceptance

- Focused reflection view/screen/keyboard and preview tests: **30 pass across 4 suites**.
  Regressions cover focus, deferred keyboard/layout/content measurement, trailing
  scroll extent, small viewports/large text, refocusing, Reduce Motion, late events,
  listener cleanup and reachable Skip/Save outside the scrolling editor.
- `npm run check`: **pass**, fresh online Expo Doctor **21/21**, contracts build,
  workspace/journey typechecks, lint, formatting, **180** tooling tests, **54** API
  unit tests, **655** mobile cases across **77** suites, and **24** contract tests.
- `npm run test:coverage -w @justgo/mobile`: **pass**, followed by the existing
  exported `coverageFailures` checker against the unchanged mobile global and
  critical-file rules. Mobile has **97.17% lines / 92% branches**; the keyboard hook
  has **100% lines / branches**. This checks mobile only; API/contracts coverage and database
  tests were not rerun for this presentation-only correction.
- Interactive Browser Use in the side panel: **pass** at **390 × 844**, **320 × 568**
  and **390 × 360**, using `/preview` with disposable text and no activity writes.
  Focus brought the heading near the top; blur/refocus and long input worked;
  Save's pending state completed back to the preview deck. In the constrained
  final layout, the heading starts at **12 px**, input ends at **280 px**, and Save
  starts at **306 px**; internal overflow remains scrollable with no footer overlap.
  No console warnings/errors were observed. The temporary viewport was reset.
  This walkthrough is separate from saved journeys and native keyboard evidence.
- Initial verification caught a test subscription type mismatch and a preview
  mock hiding the motion context. The listener test now wraps a real removable
  subscription and the mock preserves real exports. Browser review also found
  long input could nudge the heading offscreen in a short viewport; reserving
  **16 points** below the editor corrected it and the affected checks were rerun.
- **Owner-reported physical-iPhone confirmation, October 14:** Anthony confirmed
  that the keyboard change works on his phone through the independent server.
  This accepts the reported editor/footer issue on that tested setup. No native
  screenshot or recording was captured. Exhaustive repeated openings, long input,
  large text, VoiceOver and wider Phase 08/11 native/release gates remain separate;
  the brief confirmation does not establish that each was tested.

## Independent phone server

From this worktree, run:

```sh
npm run start -w @justgo/mobile -- --lan --port 8085 --max-workers 1 --clear
```

The server is retained on **8085** for owner testing. The original server remains
on **8084**. Connect the existing installed JustGO development build to
`http://10.0.0.200:8085` using its launcher or the QR saved under ignored evidence.
The installed binary is reused; no native build or installation was performed.
Startup reports the machine's known unavailable
default `simctl`; Metro and physical-phone bundle serving work independently.
The served iOS/Hermes bundle includes `useReflectionKeyboard`; this is compilation
evidence, not a native interaction pass. The initial response was **11,507,395 bytes**
and contains the final bottom-clearance calculation. Both 8084 and 8085 report
`packager-status:running` after verification.

These worktrees isolate source files, not app storage or the configured backend.
Changes in the original checkout after base `79aaf39`, including its unstaged
work, are not included. Review compatibility with the latest Phase 08 state and
obtain the owner's specific Git merge permission before combining branches.

### October 14 API configuration correction

Anthony's first launch from the new QR reached the connection/recovery page with
“Couldn't connect.” The copied `apps/mobile/.env` contained `localhost:3000`, while
the working 8084 process had an inherited `EXPO_PUBLIC_API_URL` override pointing
to the existing hosted staging API. Copying ignored files had not reproduced that
effective runtime environment; the initial bundle probe checked the keyboard code
but missed its API destination. On the physical phone, localhost is the phone.

Added an ignored `apps/mobile/.env.local` override in this worktree with
`EXPO_PUBLIC_API_URL=https://justgo-two.vercel.app`, matching the confirmed working
server and the [staging handoff](phase-11-test-server.md). Restarted only 8085 with
`--clear`; 8084 remains running. The hosted `/health` and `/ready` endpoints pass.
Rebuilt and inspected the served iOS bundle's actual virtual environment value
and both identity API/runtime reads, rather than relying on the configuration file
alone. The served bundle is **11,508,128 bytes** and the public API definitions both
resolve to the hosted test URL. No account
creation, recovery, credential changes or data reset was performed. A full reload
is required to load the corrected API value; Retry inside the previously loaded
runtime still uses its old client configuration. After this correction Anthony
confirmed that the keyboard change works on his physical phone, as recorded above.

This is local server configuration and documentation only; app code is unchanged
from the passing checks above. Ignored `api-configuration-audit.json` records the
served bundle destinations and both Metro status probes. Future worktree phone
setup must compare the effective backend with the working server and inspect the
inlined API destination before requesting a phone test.

## Local Phase 08 integration — October 14

After the owner's confirmation, the original Phase 08 checkout was inspected at
`f837552` (`Animate settings toggles with reduced-motion support`) and was clean.
The other conversation was idle. Its application-code changes do not overlap the
keyboard correction; the plan, app-shell guide and shared handoffs have updates on
both sides and must retain both sets of evidence when combined.

Anthony authorized saving this fix in a local commit and merging it into
`codex/phase-08-settings-privacy`. Fix commit **`0237152`** is combined with target
**`f837552`** without changing the accepted keyboard implementation or the newer
Settings implementation. The only merge conflict was in `docs/handoffs/README.md`;
both the October 14 keyboard entry and the three newer Settings entries are kept.

- Combined focused reflection/preview/Settings tests: **72 pass across 7 suites**.
- `npm run build:contracts`, `npm run typecheck`, `npm run lint`,
  `npm run format:check` and `npm test`: **pass**. The complete test run has
  **180** tooling tests, **54** API unit tests, **662** mobile cases across **77**
  suites and **24** contract tests.
- The fresh `npm run check` is **not green**: online Expo Doctor passes **20/21**
  and stops the command on four newer SDK 57 patch recommendations, shown below.
  The commands after Doctor were then run explicitly as listed above. The root
  gate remains enabled and failing; no validation exclusions were added.

| Package          | Pinned version | Newly recommended range |
| ---------------- | -------------- | ----------------------- |
| `expo`           | 57.0.28        | ~57.0.29                |
| `expo-constants` | 57.0.21        | ~57.0.22                |
| `expo-linking`   | 57.0.12        | ~57.0.13                |
| `expo-router`    | 57.0.26        | ~57.0.27                |

This metadata changed after the isolated fix's earlier 21/21 pass. Package pins,
lockfile and installed native binary are unchanged by integration. SDK alignment
and its required native/build/device acceptance belong to a separate maintenance
task under the repository rules; the local merge does not authorize a native build.
Owner: Anthony / implementation owner, before publication and Phase 11 release
acceptance. Keep the dependency gate open until that work passes.

- Integrated mobile coverage: **97.18% lines / 92.02% branches**, **662 cases**;
  the existing exported coverage checker passes every unchanged mobile global
  and critical-file floor. No API/shared changes or phase closeout are included,
  so database tests and API/contracts coverage were not rerun for this integration.
- Integrated side-panel Browser Use on **8084**: **pass** at **390 × 844** and
  **390 × 360** with the disposable `/preview` flow. Focus and refocus bring the
  heading near the top; long input scrolls internally and ends at **268 px**, above
  Save at **306 px** in the constrained capture. Save completes back to the
  preview deck. No console warnings/errors were observed. The viewport was reset
  and temporary tab closed. This is a walkthrough, not a saved end-to-end gate.
- Restored the main checkout's development server on **8084**, which was no longer
  running at integration start. Its launch explicitly sets
  `EXPO_PUBLIC_API_URL=https://justgo-two.vercel.app`. The fresh iOS/Hermes bundle
  is **11,462,292 bytes**, includes the keyboard hook/final clearance, and both
  identity clients and the runtime read the verified hosted API environment.
  Both 8084 and 8085 report `packager-status:running`. The five keyboard/preview
  files match `0237152` byte for byte; all eight Settings files match `f837552`.

The owner-confirmed native fix is retained; the combined app on **8084** still
needs the owner's brief physical-phone confirmation. Retain **8085** and its
worktree until that checkpoint; cleanup follows afterward. No push or PR is authorized.
Ignored integration logs, coverage audit, bundle audit, screenshot and 8084 QR
are in `.local/phase-08-reflection-keyboard/` in the main checkout.

## Organization review

Reviewed all files in the touched reflection directory: screen, view/artwork,
controller and their colocated tests form one small capability; the keyboard hook
belongs here without an additional folder. The touched `dev/previews/` directory
still contains just the cohesive preview and its tests. Documentation stays in the existing
plan/architecture/handoff groups; this focused handoff keeps keyboard evidence
separate from the growing Settings/privacy history. No moves are needed.

Routine logs, bundles and screenshots belong under ignored
`.local/phase-08-reflection-keyboard/` in this worktree.
