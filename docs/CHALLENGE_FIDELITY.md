# Challenge screen fidelity

September 24, 2026. Implementation specification for the seven references in
[DESIGN.md](DESIGN.md#september-24-challenge-references). Exact Paper JSX is retained
in `design-source/challenge-paper-extract.json` (token hash `55c015ad`).

## Contract

- Home and active challenge retain the approved six venues, cycling decks,
  existing challenge copy, five-minute attempts, recovery and confirmed outcomes.
- Omit Levels, level progress and supporting card subtext as already approved.
- Use original illustrations and icon paths, real native text, gestures and controls.
  Do not render a screenshot as an interactive screen or generate replacement art.
- Test at 320 × 611, 390 × 844, and the running iPhone Simulator. Card frames stay the same size across
  challenge lengths. The accent panel hugs its text; oversized accessibility text
  scrolls within the copy region without truncation or resizing the deck.

## Measured source

| Element         | Source values                                                                                       | Native rule                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Venue row       | 14px gutters; 6px gap; 93/94px pills; 29px height; 18px radius; .6px border; Inter 9/12; 13px icons | Three pills across at normal text size; horizontal scrolling for all six; 44pt minimum outer touch target |
| Venue label     | Inter medium 10/14; tracking .16em                                                                  | Dedicated label style, independent of generic body text                                                   |
| Venue art       | 78 × 63 crop; original raster at 320 × 611, offset -123/-240 for Park/Gym/Bookstore                 | Extracted original illustration rectangles with transparent paper matte; no replacement geometry          |
| Upper flourish  | 34 × 24; #102C49; 1.05 stroke                                                                       | Original SVG path                                                                                         |
| Skip/accept     | 44 × 44; X 22px/1.45 stroke; heart 24px/1.25 stroke; captions 9.5/12                                | Exact paths and proportions; accessible action names                                                      |
| Timer           | 180 × 86; original asymmetric SVG; Baskerville semibold 50/52; Inter 11/14 caption                  | Original path behind scalable native text; grows for accessibility                                        |
| Outcome buttons | 106/148 widths; 8px gap; 40px visible height; Inter 12/16                                           | 44pt outer targets; grow for large text                                                                   |
| Navigation      | 51px source bar, hidden labels; Home 28px, Progress 20px                                            | Compact 50pt content plus device bottom safe area once; no visible labels                                 |

## Conservative reconstructions

Header and challenge typography, text-panel contours and paper texture are baked
into the source rasters, rather than editable type/vector layers. Header uses
centered Bodoni 72 bold 17/22, with balanced 44pt side slots. Challenge text
uses Bodoni 72 regular 20/23, reduced from bold 24/25 at the user’s request.
These are explicit reconstructions, not claimed editable measurements or identical
line breaks. Bodoni 72 preserves the high-contrast serif appearance; both Bodoni
and Baskerville were verified in Paper. Native uses
the iOS system face; web falls back through Didot and Times New Roman. The timer
retains the editable source Baskerville semibold. The peach panel has a deterministic asymmetric SVG contour.
The lower flourish and illustrations reuse original pixels. Texture uses a blank
region of the original paper fill, extracted behind native content. The asset pipeline
is `scripts/design/extract-challenge-assets.mjs`; the app ships about 1MB of art
instead of the 12MB full-screen source images.

At widths above 320, illustration/card dimensions and the compact type scale grow
up to 1.2×; overall content caps at 384pt. Safe areas, touch targets and navigation
height are independent of that scale. Resting back cards show clean paper edges;
their native text appears during the gesture/transition. Every front, queued and active card uses a 220 × 273 frame before viewport scaling.
Preserve font scaling, scroll overflow and Reduce Motion. Desktop is a centered mobile composition, not a separate design.

## Stable layout and text containers

The earlier card used `minHeight` and measured its content height, allowing long
copy to grow the frame and move the action buttons. The panel itself had a 100pt
minimum height and full width, preventing it from hugging short copy. Now the
outer frame is fixed, the illustration/footer have stable positions, and a
bounded copy region centers an intrinsic-width/height accent panel. The copy has
10pt scaled padding and no line limit. All catalog copy uses the same 20/23
type treatment; the venue copy is reviewed to fit in two to four lines on the
native card. A vertical ScrollView remains an overflow fallback.

The base card now uses 23pt top padding, 13pt bottom padding and 5pt gaps
between the venue label, illustration, copy and lower flourish. That leaves
about 116pt for the copy region at 320pt width. Four lines at the normal 20/23 type
with 10pt text padding need 112pt, so the panel fits without changing the
220 × 273 outer frame or shrinking the type. This spacing change addresses
four-line copy. Check future challenge batches in the native card before release,
including database cards and any preview or demo cards shown in the app.
On September 26, the iPhone 17 native audit covered 61 database placements and
all eight preview examples (six venue references and two rotating cards). All
rendered in two to four lines with the text panel inside its available space.

The [OMO card screen](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/OMO-0)
has a 320 × 611 artboard. Its front card measures about 220 × 273 within the
raster card stack, consistent with the editable 220 × 273 card in the active
reference. The source's 44pt action circles start about 32pt below the front-card bottom.
The previous native frame was 220 × 310 and its flexible action area centered
the buttons in the remaining screen space. The shorter shared frame and a
32pt scaled card-to-button gap followed that source spacing; the buttons now sit
8pt lower by request. Short and long challenges keep the same outer size. A
short panel still hugs its text, so some
interior paper space remains by design.

The venue label, illustration view and intrinsic text panel use the same card
center. Original Paper illustration crops have asymmetric margins inside their
image canvases; the café artwork is 27 source pixels left of center. Small
per-venue image offsets center the drawn art on the label and panel without
changing the original image pixels or card geometry.

The queued card previously added a padded inner wrapper that the front card did
not have. Absolute flourish offsets therefore used different origins, producing
a jump at promotion. All three card states now use the same full-frame face and
the reveal layer fills that frame without adding padding. Texture is painted once.

On iOS, a percentage-sized SVG positioned directly inside the intrinsic text
panel did not resolve to the text’s actual bounds. An absolute-fill native View
now establishes the SVG viewport; padding belongs to the text. The timer uses
the same viewport pattern so its background includes its caption. Browser-only
checking had missed this native rendering difference.

## Card color variants — September 25

The light reference uses peach accents. Paper’s
[cream-front](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/O4X-0)
and [peach-front](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/O6F-0)
cards instead use pale cream behind both the illustration and challenge copy.
The earlier implementation varied only the card surface, leaving every text
panel and baked illustration backing peach.

| Card surface         | Text panel      | Illustration backing           |
| -------------------- | --------------- | ------------------------------ |
| Light `#F9EFE8`      | Peach `#FBE3CC` | Peach artwork matched to panel |
| Warm cream `#F9E3D0` | Cream `#F8EFE7` | Cream artwork variant          |
| Peach `#FCD9B9`      | Cream `#F8EFE7` | Cream artwork variant          |

These references are raster overlays, not editable accent fills. Exact JSX and
original fill URLs are in `design-source/challenge-color-variants.json`. The cream
value is a raster sample, not a claimed Paper token: median RGB from the blank
panel region `(155,280,20,100)` of the original fill normalized to 620 × 628 is
`(248,239,231)` for cream-front and `(248,239,232)` for peach-front. Their illustration
backings have the same pale tone. Use the shared `#F8EFE7` reconstruction for both.

Each card now carries its surface, panel and artwork theme together, indexed by
the same deck turn/position before and after promotion. The active card now retains
the accepted card’s theme (updated in the active handoff correction below). Original irregular panel geometry, adaptive text bounds,
fixed frame, font sizing and flourish positions are retained.

Both artwork variants retain the original illustration alpha masks and all navy
pixels with red ≤ 100. `cream-artwork.mjs` shifts the warm background to the
matching text-panel color and feathers the change through antialiased edges.
Texture and shapes remain intact. Run `node --test scripts/design/cream-artwork.test.mjs`
after pipeline changes; regenerate with the documented `sharp` runtime.

The OMO source raster uses approximately `#F9EFE8` for both its paper page and
light card. Previously the native page was white and a multiply-blended texture
darkened the `#F8F0E9` card into a grayish cream. The challenge screen and light
card now share `#F9EFE8`; the original paper texture is composited normally at
25% opacity so it adds grain without changing the base hue. The source venue
illustrations contain different warm backings, so their light variants are
palette-matched to the native `#FBE3CC` copy panel. Cream variants remain matched
to `#F8EFE7`.

## Swipe handoff correction — September 25

The temporary light buttons were a 50% opacity style applied whenever the deck
was animating or saving. The card flash had two lifecycle causes: the live screen
key included the queue version (remounting the whole deck on every skip), and a
queued card was replaced by a separate front-card component. Animation values
also reset in the action promise's `finally`, independently of React committing
the confirmed queue.

The deck now stays mounted for the same account/venue/focus, and one keyed
`DeckLayer` owns each card through promotion. Motion uses an absolute queue slot,
so the incoming card has the same position before and after the queue update.
The callback returns the authoritative queue version; the deck waits for that
version to render before rebasing its animation and unlocking input. Failed saves
settle the original card back. Controls remain opaque during this temporary lock;
a September 27 correction also keeps them opaque during the return-to-deck
refresh while input is temporarily disabled. Only the incoming front card
reveals its content during motion; the other fanned edges stay clean instead of
briefly exposing text/flourishes and hiding them again at the handoff.

`npm run check` passed: 92 mobile, 8 API and 8 contract tests plus type checking,
lint and formatting. New coverage checks mounted view identity, delayed queue
commits, input exclusion without opacity changes, unsuccessful saves and the
pose on both sides of promotion. In-app browser samples during a skip showed
button opacity fixed at 1, with the incoming card approaching and retaining the
identity transform as its label became the front label. Browser drag, acceptance
and native button-driven promotion were checked. Automated drags through the
simulator mirror still did not trigger a native swipe; physical touch verification
remains separate from those passing transition checks.

## Active challenge handoff correction — September 25

Give up now saves directly without a confirmation panel. Both outcome controls
keep their normal opacity while duplicate actions are blocked. Previously the
Completed button dimmed on every save, even when Give up was tapped.

The finish response cleared the active attempt before the server’s rotated
queue had arrived. The deck therefore briefly showed the just-ended card. The
controller now keeps the active screen until the confirmed next queue is ready,
then publishes the outcome, queue and unlocked controls together. If fetching
the queue fails, the active view stays stable and Retry save reuses the original
attempt/outcome/time zone. Initial refresh also publishes the active attempt
with its venue queue, so restoration does not briefly use a fallback color.

Active cards use the same queue turn and shared surface/panel/artwork theme as
the accepted deck card. The server leaves the queue unchanged during an active
attempt, so its version also restores the correct theme after reload. The
preview follows the same rule.

Validation: full check passed (101 mobile, 8 API, 8 contract tests, type checking,
lint and formatting). Regressions cover delayed and failed next-queue reads,
stable active colors until handoff, duplicate outcome protection without dimming,
restoration with a queue, and matching all three theme parts on acceptance.
In-app browser checks against the real local API confirmed both darker themes
on acceptance and the next card in every sampled post-give-up frame, with the
deck controls at full opacity. The mirrored native app also retained both
darker themes and returned directly to the next challenge. The mirror’s bundle
reload control stalled the development session; restarting the installed app
restored the same active card color and original deadline.

## September 25 contrast verification

- `npm run check`: passed — 88 mobile, 8 API and 8 contract tests, workspace
  type checking, lint and formatting. Six new component cases check both darker
  themes and the wrap back to the light theme for every venue, including promotion.
- `node --test scripts/design/cream-artwork.test.mjs`: 3 passed. A pixel comparison
  of all six generated assets also confirmed identical alpha masks and dark navy
  pixels, with their warm backings changed to cream.
- In-app browser: both darker colors passed for all six venues. Every cream asset
  loaded; surface, panel and artwork variants matched. Frames remained 264 × 372;
  long/short panels remained about 224 × 162 and 107 × 52. Accepting a dark card
  retained the active screen’s light theme, and completion returned to the deck.
- Live iPhone 17 mirrored in the in-app browser: both darker Café cards were
  visually checked with long/short text; Park, Bookstore and Bars cream accents
  were checked too. Illustration silhouettes, adaptive panels and fixed frames
  remained intact. Button-driven promotion passed. Automated native drag still
  did not advance the deck; the earlier native drag verification gap remains.

## Earlier layout verification

- `npm run check`: passed — 82 mobile, 8 API and 8 contract tests, workspace type
  checking, lint and formatting. Regression coverage includes fixed deck/active
  geometry across copy lengths and the queued-to-front flourish coordinate system.
- Production web and iOS exports: passed, one Metro worker, in
  `apps/mobile/.expo/fidelity-{web,ios}`. No new native binary or deployment.
- In-app browser: all six reference fixtures have a 220 × 310 card at 320px width.
  At 390 × 844, reference/long/short cards remain 264 × 372 at the same coordinates.
  The peach panel changes from about 224 × 162 for the long fixture to 107 × 52
  for “Say hello.” Front and back face dimensions/origins and flourish offsets
  match. A left drag advances long to short; skip, accept and completion work.
- At 320 × 568, the long fixture fits its 186 × 135 panel without copy overflow;
  the outer screen scrolls to reveal the buttons. Active challenge retains the
  same 220 × 310 frame. Original illustrations, header/pills, uneven shapes and
  compact navigation were visually checked in the earlier reference comparison.
- iPhone 17 / iOS 26.4 Simulator is now accessible. Gym plus Café reference,
  long/short copy, skip/accept and active challenge were visually checked. This
  caught and verified the native SVG viewport fix for the peach panel and timer.
  Computer Use drags did not advance the native deck (including outside the copy
  ScrollView); native touch-drag verification remains pending. Browser drag and
  button-driven native handoff passed. Dynamic Type/VoiceOver are not verified.
- Earlier real local API checks passed: venue selection, skip, acceptance, Keep
  trying, confirmed give-up, Progress/Home recovery and Success/Continue. The
  Settings → Preview → Exit cache-notification regression also passed. These
  layout refinements do not change the attempt/controller behavior.

Future visual changes must use these reference fixtures and measured component
rules, check all six venues plus active/long/short-copy states on web and native,
and record remaining differences. Functional tests alone do not establish visual
fidelity; intrinsic SVG backgrounds must be verified on iOS too.
