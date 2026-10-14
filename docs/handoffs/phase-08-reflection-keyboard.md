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
  large text, VoiceOver and wider Phase 08/09 native/release gates remain separate;
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
server and the [staging handoff](phase-09-test-server.md). Restarted only 8085 with
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

## Integration preparation

After the owner's confirmation, the original Phase 08 checkout was inspected at
`f837552` (`Animate settings toggles with reduced-motion support`) and was clean.
The other conversation was idle. Its application-code changes do not overlap the
keyboard correction; the plan, app-shell guide and shared handoffs have updates on
both sides and must retain both sets of evidence when combined.

Anthony subsequently authorized saving this fix in a local commit and merging it
into `codex/phase-08-settings-privacy`. Combined checks and verification through
port 8084 follow the local merge. Keep 8085 and this worktree until integrated
verification succeeds; cleanup follows afterward. No push or PR is authorized.

## Organization review

Reviewed all files in the touched reflection directory: screen, view/artwork,
controller and their colocated tests form one small capability; the keyboard hook
belongs here without an additional folder. The touched `dev/previews/` directory
still contains just the cohesive preview and its tests. Documentation stays in the existing
plan/architecture/handoff groups; this focused handoff keeps keyboard evidence
separate from the growing Settings/privacy history. No moves are needed.

Routine logs, bundles and screenshots belong under ignored
`.local/phase-08-reflection-keyboard/` in this worktree.
