# JustGO design guide

**September 24 scope update:** [Phase 04 decisions](../product/PHASE_04_SCOPE.md) define six manual venues, independent cycling stacks, the 39O fanned deck and five-minute attempts. Omit subtext and the future level-progress indicator. Shared content keeps separate venue placements; completed cards can recur as new attempts. Confirmed expired access locks paid functionality without a finish/reflection exception. See the [implementation handoff](../handoffs/phase-04-challenge-loop.md) for evidence and remaining device gates.

Extracted September 17, 2026 from [Paper Version 3](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0). The selected final row is authoritative for appearance; [PRD §2](../product/PRD.md#2-design-authority-and-changes-from-the-previous-prd) owns behavior. The earlier cobalt page tokens and local inspiration screenshots do not override the selected row.

## Authoritative references

| Surface          | Selected Paper reference                                                 | Implementation interpretation                                                                                                         |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Home             | 39O centered front card; cream-front and peach-front three-card variants | Six venue pills; independent fanned queues. X/left skips, heart/right accepts. Three colors cycle; omit subtext and level progress.   |
| Active challenge | 19 — Navy timer · Pill action buttons                                    | Readable instruction, timer, Give up / Completed; retain Home and Progress navigation.                                                |
| Success          | 40B — A small medal · Larger illustration · That’s a win!                | Separate celebration and Continue; medal is decorative, not an awards system.                                                         |
| Reflection       | D1 — Mood and reflection · Simplified                                    | Five labeled relative feelings, no default, typed text, no Dictate button.                                                            |
| Progress         | P37 — Progress · Total reps summary                                      | Preserve current/best streak, all-time reps, month/year calendar, daily rep badges, monthly reps and active days.                     |
| Day sheet        | P31 — Day journal · Friday, September 18                                 | Overlay P37; retain attempt timings/feelings and add the later approved saved-reflection interaction. Omit the entire Day note block. |
| Settings         | F1 — Outlined icon groups · Meetup                                       | Visual reference only; PRD defines the rows. No device-only storage claim.                                                            |

`design-source/paper-extract.json` retains exact JSX and token content hashes for the editable source. `design-source/{success,reflection,progress,day-sheet}.png` are reference exports, never runtime screen images. Many Paper screens use full-screen raster compositions: their embedded text, type metrics and color values cannot be represented as verified editable measurements. Record reconstruction decisions separately from verified editable measurements. Challenge-specific measurements, asset provenance, conservative typography/contour reconstructions and verification live in [CHALLENGE_FIDELITY.md](CHALLENGE_FIDELITY.md). Do not claim raster lettering has verified font metrics.

## Type, palette and spacing

Code authority: [`apps/mobile/src/theme/tokens.ts`](../../apps/mobile/src/theme/tokens.ts). No parallel JSON token system.

- **Display:** Baskerville. Paper confirms regular, semibold, bold and italic faces. Use the iOS system face, with Baskerville/Georgia fallback in web previews. Do not redistribute Apple's font files. Android typography is deferred.
- **UI:** Inter regular 400, medium 500 and semibold 600. The pinned `@expo-google-fonts/inter` package bundles licensed font files; retain its SIL Open Font License. Import individual weight modules so unused weights are not bundled.
- **Verified colors:** text/primary action `#102C49`, navigation `#142F46`, navigation hairline `#0D2539`, Success canvas `#F8F0E9`, Progress canvas `#FCF9F3`, white `#FFFFFF`, gesture peach `#FCE1CB`, border `#B7B2AC`. These come from computed styles or referenced tokens in the selected screens, not the obsolete cobalt canvas tokens.
- **Feeling artwork:** outline `#12395C`; editable SVG endpoint fills `#C794A7`, `#F5C7AE`, `#BBE1D1`, `#92CDAF`. The neutral feeling is embedded in the raster; its exact fill remains unverified. These are decorative colors, not clinical scoring or sole selection labels.
- **Verified type metrics:** Success heading 29/32px, Baskerville semibold, tracking -0.025em; message 12/18px, Inter regular; Continue label 13/18px, Inter medium. The completed challenge view scales these source values with its width. The timer remains 50/52px at the reference width.
- **September 27 typography refinement:** At the user's request, Success's headline, Reflection's two section headings, Progress's month and monthly-rep label, and the day sheet's date and challenge titles use the narrower Bodoni 72 bold face through `fontFamilies.editorial`. This replaces the broad Baskerville semibold treatment while preserving text sizes and line heights, with modest negative tracking. Reflection and Progress source lettering is raster, so Bodoni is a visual reconstruction rather than verified source font metadata. Success deliberately follows this requested refinement over its editable Baskerville source. The current/best streak day counts also use Bodoni 72 with tighter tracking. Rep totals and the timer retain Baskerville.
- **Spacing:** The completed challenge view follows the selected Paper artboard: 29px horizontal inset, a 262 × 246px illustration beginning 50px below the status bar, a 16px illustration-to-heading gap, a 14px heading-to-message gap, and a 262 × 44px Continue button anchored above the safe bottom edge. These values scale with screen width; other screens use the reusable 4/8/12/16/24/28/32/48 spacing scale.
- **Shape:** The challenge timer uses its original asymmetric SVG outline; challenge text panels use a stable uneven SVG contour, not a generic corner radius. Challenge cards retain 20px outer corners. Skip/accept controls have a 22px radius. Source Continue height is 44px; the general implementation uses 48px minimum. Compact challenge pills and outcome buttons keep at least 44px outer hit areas independently of their visible height.

## Assets and component rules

The illustration in `apps/mobile/assets/illustrations/small-medal.png` is a **2× Paper export of the isolated medal illustration**, not a generated replacement. Its opaque white backdrop is composited with multiply against a matching `#F8F0E9` parent on iOS; that parent fill is necessary to avoid a visible white rectangle. Provenance is documented in the asset README.

`apps/mobile/assets/icons/` contains extracted Home, Progress, close, heart and flourish SVGs with exact path data and resolved colors. Use `react-native-svg` components for interactive controls when their features arrive; these source files do not establish navigation behavior.

Use React Native `StyleSheet` and imported tokens, with no second styling framework. Keep body text readable and scalable, real text/controls accessible, images decorative where appropriate, and buttons named by action. Preserve safe areas and allow scrolling at 320px widths and large text sizes. The foundation screen contains no motion; later motion must respect Reduce Motion. Do not copy Paper's mock status bars, home indicator, absolute screen coordinates or fixture data into product behavior.

## Open design work

Owner: Anthony (product/design), with implementation measurements recorded in each consuming phase.

- Phase 03: navigation and supporting empty/error states using existing references. Welcome/questionnaire onboarding is deferred; paywall designs belong to phase 07.
- Phase 04: implemented per [handoff](../handoffs/phase-04-challenge-loop.md). Physical-iPhone motion/large-text/VoiceOver/Reduce Motion acceptance remains open. Original venue illustrations and the lower flourish are extracted from the source image fills; native text and irregular panel geometry remain separate. The [fidelity specification](CHALLENGE_FIDELITY.md) supersedes generic foundation type/spacing defaults for these screens.
- Phase 05: D1 is reconstructed as native text, five SVG faces and a multiline text field. The neutral fill is a close visual reconstruction because the reference only exposes it as raster; the other four face colors and expression paths come from the saved Paper extraction. The September 27 approved bottom action reads Skip with no input and Save Reflection with a feeling or nonblank text. Empty Back/X skips; dirty Back/X offers save, keep editing or discard and skip. No Dictate control is present. Physical-iPhone keyboard, long-text and VoiceOver acceptance remain open in the phase 05 handoff.
- Phase 06: the calendar/day sheet reconstruction and read-only saved-reflection expansion are implemented locally. Native visual and accessibility acceptance remains open.
- Phase 08: approved Settings rows/reminder defaults and accessibility adaptations.

The foundation preview borrows approved visual elements to verify fonts, controls, layout and connectivity. Its introductory copy is temporary development copy; it does not approve onboarding or implement the challenge loop.

## September 24 challenge references

The user supplied [Cafe NDS](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/NDS-0), [Streets OKI](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/OKI-0), [Park OHD](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/OHD-0), [Gym OHW](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/OHW-0), [Bookstore OJ2](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/OJ2-0), [Bars O8F](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/O8F-0), and [active NAZ](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/NAZ-0). Inspected through Paper MCP. Cards combine original decorative image assets with native text and SVG geometry. The deterministic extraction script and retained Paper JSX preserve provenance; source image fills are never used as full-screen runtime UI. Active layout places the navy timer above the card and Give up/Completed side by side. The editable active-card shadow is `#5937163D 0px 4px 12px, #59371629 0px 1px 3px`; palette and adapted dimensions live in the TypeScript tokens/components.

The shared challenge header is centered independently of its Settings icon. Venue pills retain editable source icons and compact visual proportions inside 44px touch targets. Home/Progress navigation uses a 50px icon row plus the native bottom inset once, with accessible names and no visible labels. The development `/preview` screen includes all six reference texts, long-copy and short-copy cases, and the active challenge for repeatable comparison without saved activity.
