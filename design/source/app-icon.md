# JustGO app icon

Anthony selected the existing navy GO mark on cream for the app icon on
October 25, 2026. The existing transparent
`apps/mobile/assets/brand/justgo-mark.png` was inspected and supplied as the
edit target to the built-in GPT Image tool. No editable vector original exists
in the repository. The launch-screen mark remains unchanged.

The result is a model-assisted composition of the approved branding, not an
exact pixel export of the transparent source. The opaque generated square was
resampled from 1254 × 1254 to 1024 × 1024 with macOS `sips`, without cropping.
It is saved as `apps/mobile/assets/brand/justgo-app-icon.png` and selected by
the Expo app configuration. The PNG is RGB without an alpha channel. A new
native build is required to inspect its appearance on a device.

## Prompt

> Use case: compositing. Asset type: iOS App Store app icon, square opaque PNG
> 1024 by 1024. Edit target: the attached existing JustGO transparent navy
> GO/infinity brand mark. Primary request: make a store app icon using this EXACT
> existing mark centered on a flat warm cream #F9EFE8 square background. Keep the
> original GO mark geometry, thick stroke weight, connected G-to-O infinity form,
> shape, proportions, and navy color #142F46 unchanged; only scale uniformly and
> place in the icon. The mark should occupy approximately 76% of the square
> width, centered horizontally and vertically, with ample cream above/below. No
> redesign, no added letters, no wordmark, no shadows, no gradients, no border,
> no corner rounding, no guide lines. Background is solid and completely opaque
> edge to edge. Preserve the identity of this approved logo exactly.
