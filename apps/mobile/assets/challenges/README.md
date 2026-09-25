# Paper challenge artwork

Original approved artwork from the seven September 24 Paper references, retained
as decorative images. No generated replacement illustrations and no screenshot
screen UI. Native components own every label, instruction, control and panel.

`scripts/design/extract-challenge-assets.mjs` downloads the original image fills,
uses the Paper crop coordinates, composes the Streets corrections, and removes
the surrounding paper matte. Original color/stroke pixels remain; only alpha is
derived from the paper background. The lower flourish is an ink-only extraction.
The texture is a blank paper region. Output is 4× to keep strokes sharp on iPhone.

The `*-cream.png` variants adapt the warm illustration backing to `#F8EFE7`
for both darker card colors. This is the median cream sampled from the original
Paper cream-front fill, also checked against the peach-front fill. The extractor
keeps every alpha value and dark navy pixel unchanged; a smooth tonal mask shifts
the backing and antialiased edges while retaining their texture. These are palette
adaptations of the original six illustrations, not newly drawn silhouettes. The
light card continues to use the untouched peach artwork.

Run `node --test scripts/design/cream-artwork.test.mjs` when changing the
extraction pipeline. Component tests also cover all six venues through the
cream → peach → light card cycle and queued-to-front theme handoff.

Source IDs, URLs and geometry are retained in
`docs/design-source/challenge-paper-extract.json`; full source images are cached
under ignored `output/challenge-fidelity/source/` instead of shipped in the app.
The extractor requires `sharp` as a development tool only (available in the Codex
workspace dependency runtime); no mobile dependency or native rebuild is needed.
The two color-variant exports are retained in
`docs/design-source/challenge-color-variants.json`.

See `docs/CHALLENGE_FIDELITY.md` for measured values, reconstruction decisions and
verification evidence. The raster header lettering and peach-panel contour have
no editable font/path metadata and are documented as native reconstructions.
