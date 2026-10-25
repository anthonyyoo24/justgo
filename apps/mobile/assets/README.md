# Bundled assets

- `brand/justgo-mark.png`: approved thick navy GO mark without a wordmark from
  [the cream launch design in Paper](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/PH9-0).
  The GPT Image source's transparent margins were removed by copying its original
  RGBA pixels into a 425 × 234 asset; the geometry and stroke weight are unchanged.
  The native launch screen and runtime loading surface both contain this asset in
  a centered 194-point square over the app's `#F9EFE8` cream, with no animation.

- `brand/justgo-app-icon.png`: opaque 1024 × 1024 RGB store icon prepared with
  the built-in GPT Image tool on 2026-10-25 using the approved GO mark above as
  the edit target. It centers the navy GO branding on cream, without text,
  rounded corners or guides. This is a model-assisted composition, not an exact
  pixel export of the transparent source. The generated square was resampled
  to 1024 × 1024 without cropping. Source and prompt are recorded in
  `design/source/app-icon.md` at the repository root.

- `illustrations/icloud-progress-cards.png`: transparent cloud and three paper cards prepared with the built-in GPT Image tool from the approved [peach iCloud Sync sheet in Paper](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/PG0-0) on 2026-10-22. Only the decorative illustration is raster; the sheet heading, disclosure, X and Start Syncing button are native controls. Source and prompt are recorded in `design/source/icloud-sync-illustration.md`.

- `illustrations/disconnected-plugs.png`: transparent illustration prepared with the built-in GPT Image tool from the corrected [initial attempts failure design in Paper](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/OTO-0) on 2026-09-29. Includes the left plug, right receiving socket, two clouds, and three rays. The source is a flattened screen image, so this cutout is a model-assisted reproduction, not an exact pixel export. Prompt and source details are in `design/source/progress-failure-illustration.md`.

- `illustrations/small-medal.png`: isolated “Illustration — A small medal · Enlarged” from the selected 40B Success screen in [Paper Version 3](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0), exported at 2× on 2026-09-17. Keep the multiply composition used by the source. This user-provided design asset is not an icon/store artwork license assertion.
- `icons/{home,progress,close,heart,flourish}.svg`: exact SVG paths extracted from the selected 39O Home JSX, CSS variables resolved and JSX attribute names converted to SVG. No Levels icon is bundled.
- `icons/reflection-pencil.png`: transparent pencil asset from the approved [01B inline reflection design in Paper](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/OS8-0), reused for the reflection action and saved reflection heading at the source display size (15.305 × 16.464 points).
- Inter 400/500/600: loaded from the pinned `@expo-google-fonts/inter` package, SIL Open Font License in that package's `LICENSE_FONT`. Baskerville uses the iOS system font and is not copied into this repository.
- Expo template icons at the asset root remain scaffolding placeholders and are
  not referenced by the native app icon configuration. Store builds use
  `brand/justgo-app-icon.png`.

Full-screen Paper reference exports live under `design/source`, never in the runtime bundle. No app screen uses a full-screen raster as its interface.
