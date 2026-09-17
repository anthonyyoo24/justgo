# Bundled assets

- `illustrations/small-medal.png`: isolated “Illustration — A small medal · Enlarged” from the selected 40B Success screen in [Paper Version 3](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0), exported at 2× on 2026-09-17. Keep the multiply composition used by the source. This user-provided design asset is not an icon/store artwork license assertion.
- `icons/{home,progress,close,heart,flourish}.svg`: exact SVG paths extracted from the selected 39O Home JSX, CSS variables resolved and JSX attribute names converted to SVG. No Levels icon is bundled.
- Inter 400/500/600: loaded from the pinned `@expo-google-fonts/inter` package, SIL Open Font License in that package's `LICENSE_FONT`. Baskerville uses the iOS system font and is not copied into this repository.
- Expo template icons in this folder are scaffolding placeholders, not approved App Store artwork. Replace before distribution.

Full-screen Paper reference exports live under `docs/design-source`, never in the runtime bundle. No app screen uses a full-screen raster as its interface.
