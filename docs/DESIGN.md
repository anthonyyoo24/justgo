# JustGO design guide

Extracted September 17, 2026 from [Paper Version 3](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0). The selected final row is authoritative for appearance; [PRD §2](PRD.md#2-design-authority-and-changes-from-the-previous-prd) owns behavior. The earlier cobalt page tokens and local inspiration screenshots do not override the selected row.

## Authoritative references

| Surface          | Selected Paper reference                                                 | Implementation interpretation                                                                                                         |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Home             | 39O centered front card; cream-front and peach-front three-card variants | General deck; left/X replace, right/heart accept. No venue chips or Levels tab. Color-variant assignment is undecided.                |
| Active challenge | 19 — Navy timer · Pill action buttons                                    | Readable instruction, timer, Give up / Completed; retain Home and Progress navigation.                                                |
| Success          | 40B — A small medal · Larger illustration · That’s a win!                | Separate celebration and Continue; medal is decorative, not an awards system.                                                         |
| Reflection       | D1 — Mood and reflection · Simplified                                    | Five labeled relative feelings, no default, typed text, no Dictate button.                                                            |
| Progress         | P37 — Progress · Total reps summary                                      | Preserve current/best streak, all-time reps, month/year calendar, daily rep badges, monthly reps and active days.                     |
| Day sheet        | P31 — Day journal · Friday, September 18                                 | Overlay P37; retain attempt timings/feelings and add the later approved saved-reflection interaction. Omit the entire Day note block. |
| Settings         | F1 — Outlined icon groups · Meetup                                       | Visual reference only; PRD defines the rows. No device-only storage claim.                                                            |

`design-source/paper-extract.json` retains exact JSX and token content hashes for the editable source. `design-source/{success,reflection,progress,day-sheet}.png` are reference exports, never runtime screen images. Many Paper screens use full-screen raster compositions: their embedded text, type metrics and color values cannot be represented as verified editable measurements. Resolve these with the owner during the relevant feature. Do not invent exact values from those screenshots.

## Type, palette and spacing

Code authority: [`apps/mobile/src/theme/tokens.ts`](../apps/mobile/src/theme/tokens.ts). No parallel JSON token system.

- **Display:** Baskerville. Paper confirms regular, semibold, bold and italic faces. Use the iOS system face, with Baskerville/Georgia fallback in web previews. Do not redistribute Apple's font files. Android typography is deferred.
- **UI:** Inter regular 400, medium 500 and semibold 600. The pinned `@expo-google-fonts/inter` package bundles licensed font files; retain its SIL Open Font License. Import individual weight modules so unused weights are not bundled.
- **Verified colors:** text/primary action `#102C49`, navigation `#142F46`, navigation hairline `#0D2539`, Success canvas `#F8F0E9`, Progress canvas `#FCF9F3`, white `#FFFFFF`, gesture peach `#FCE1CB`, border `#B7B2AC`. These come from computed styles or referenced tokens in the selected screens, not the obsolete cobalt canvas tokens.
- **Feeling artwork:** outline `#12395C`; editable SVG endpoint fills `#C794A7`, `#F5C7AE`, `#BBE1D1`, `#92CDAF`. The neutral feeling is embedded in the raster; its exact fill remains unverified. These are decorative colors, not clinical scoring or sole selection labels.
- **Verified type metrics:** Success heading 29/32px, semibold, tracking -0.025em; timer 50/52px. Original Success body is 12/18px and button 13/18px at 320px width. Adapt body to 16/24 and actionable labels to 15/20 for native readability; these are explicit implementation decisions, not claims of source equality.
- **Spacing:** source gaps include 4, 8, 10 and 14px, with 29px horizontal Success inset. Normalize to the reusable 4/8/12/16/24/28/32/48 scale. Components use semantic `screen` and `section` spacing. Scale by available space, not by multiplying a complete screenshot.
- **Shape:** 20px timer/card corner, 22px circular control radius, full pill actions. Source Continue height is 44px; implementation uses 48px minimum and at least 44px interactive hit areas.

## Assets and component rules

The illustration in `apps/mobile/assets/illustrations/small-medal.png` is a **2× Paper export of the isolated medal illustration**, not a generated replacement. Original white artwork is composited with multiply on cream, matching Paper's treatment. Recheck its appearance on the actual native renderer. Provenance is documented in the asset README.

`apps/mobile/assets/icons/` contains extracted Home, Progress, close, heart and flourish SVGs with exact path data and resolved colors. Use `react-native-svg` components for interactive controls when their features arrive; these source files do not establish navigation behavior.

Use React Native `StyleSheet` and imported tokens, with no second styling framework. Keep body text readable and scalable, real text/controls accessible, images decorative where appropriate, and buttons named by action. Preserve safe areas and allow scrolling at 320px widths and large text sizes. The foundation screen contains no motion; later motion must respect Reduce Motion. Do not copy Paper's mock status bars, home indicator, absolute screen coordinates or fixture data into product behavior.

## Open design work

Owner: Anthony (product/design), with implementation measurements recorded in each consuming phase.

- Phase 03: navigation and supporting empty/error states using existing references. Welcome/questionnaire onboarding is deferred; paywall designs belong to phase 08.
- Phase 04: final challenge art/catalog, three Home variant semantics, deck counter/exhaustion copy.
- Phase 06: neutral feeling asset, final dismissal/save behavior and text-input layout without Dictate.
- Phase 07: saved reflection reading, exact raster-derived calendar styling and duration formatting.
- Phase 09: approved Settings rows/reminder defaults and accessibility adaptations.

The foundation preview borrows approved visual elements to verify fonts, controls, layout and connectivity. Its introductory copy is temporary development copy; it does not approve onboarding or implement the challenge loop.
