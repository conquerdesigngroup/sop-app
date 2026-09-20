# "How to create your account" — explainer videos

Two cuts of one 16:9 explainer for families signing up to the parent portal,
both built from `template.html`:

| | `--variant full` | `--variant short` |
|---|---|---|
| File | `docs/marketing/how-to-create-your-account-30s.mp4` | `…-15s.mp4` |
| Length | exactly 30.000s (900 frames) | exactly 15.000s (450 frames) |
| Size | ~2.3 MB | ~1.2 MB |
| For | sending to a family who is stuck, or a help page | a text, a story, a reminder |

Both are 1920×1080, H.264 High / yuv420p, 30fps, `+faststart`, with a poster
frame beside them. **Neither has audio** — they are captioned throughout, so
they work muted, which is how they will be watched.

## What they show

The real flow, in the app's own words, so nothing on screen contradicts what a
parent is looking at:

1. Front door → **Dancer Portal** → **Sign up** (`ChooserPage`, `PortalLogin`)
   — which of the two doors, and which of the two buttons, is the thing the
   opening has to make unmissable; see **Making the taps readable** below
2. Name and **the Enrollio email** (`PortalSignUp`, step `details`)
3. A password, twice, 6+ characters (step `password`, `CLIENT_MIN_PASSWORD`)
4. The 6-digit code (step `verify`)

The 30s cut adds the two things the 15s can only assert:

- **Why the email has to be the Enrollio one.** A diagram: Enrollio holds the
  studio's family list, the app looks your address up on it, same address →
  code sent, any other address → nothing. It is the app's own explanation
  (`PortalSignUp`'s first paragraph, `ChooseDoor`'s footnote) drawn instead of
  stated.
- **Actually going and getting the code.** The phone leaves the portal for a
  mail app — deliberately light, so it is obvious you have switched apps —
  the email from the studio arrives, it opens, the six digits are shown large,
  and only then does it come back and type them in.

Both of those are failures the signup endpoint cannot report. `portal-signup`
answers `200 { ok: true }` whether or not the address is on the roster — on
purpose, so signup cannot be used to test which families attend — so a parent
who used the wrong address just never gets a code, with nothing to say why.
Saying it in advance is the only place left, which is why both cuts carry the
junk-folder warning and the 30s spends five seconds on the Enrollio point.

## Regenerating

```bash
npm install --no-save playwright ffmpeg-static   # both, in ONE command
node scripts/marketing/signup-video/render.js --variant full     # 30s, ~4.5 min
node scripts/marketing/signup-video/render.js --variant short    # 15s, ~2.5 min
```

Install them together. `--no-save` leaves `package.json` alone, so a second
`npm install --no-save` prunes whatever the first one added.

Chromium comes from the pre-installed bundle. **ffmpeg does not** — the one
inside the Playwright bundle is built `--disable-everything` with VP8/WebM only
and dies on `Unrecognized option 'preset'`. `render.js` takes `$FFMPEG`, then
`ffmpeg-static`, then `ffmpeg` on `PATH`.

While iterating, render one frame instead of all of them — about a second:

```bash
node scripts/marketing/signup-video/render.js --variant full --frame 10.6
```

Other flags: `--fps`, `--out`.

## How it is built

`template.html` is a standalone page whose every animated property is a pure
function of time. Nothing runs on a timer or a CSS animation: `__seek(t)` sets
the whole frame, and `render.js` calls it once per frame and screenshots each
one.

That is why each output is exactly its stated length with no dropped or
duplicated frames however slow the machine is — a screen recording of the same
page would not be. It is also why you can jump straight to a frame to look at
it.

Editing:

- **Both cuts live in `TIMELINES`** (`short` and `full`), and `__setVariant()`
  picks one. A cut is four lists: `beats` (the left-hand captions and which of
  the four steps each belongs to), `segs` (when stage-right changes screen),
  `taps` (when and what is tapped) and `type` (typing, callout and burst
  timings). `diagram` holds the Enrollio explainer's internal timings and is
  `null` for the short cut.
- **`segs` is a list of (time, screen), not one entry per screen**, because the
  full cut visits `details` and `verify` twice each.
- **Screen transitions are asymmetric on purpose** — what is arriving eases out
  so it lands decisively, what is leaving eases in-out and slides under it.
  Collapsing both onto one curve is visible.
- **Taps and the email callout are anchored by selector** and measured off the
  live layout, not by hardcoded x/y, so they stay on target when copy above
  them rewraps. `centreIn()` divides the live punch-in scale back out, because
  `getBoundingClientRect()` returns the transformed rect while the indicators
  are positioned in the phone's own unscaled pixels.
- **`punch`** zooms the phone during a beat, and **`spot`** lights one target
  and pulls back what competes with it.
- **Brand** — colours and type are the tokens from `public/brand/tokens.json`,
  and the mark is `public/brand/logos/didc-mark-3d.png` read from the repo and
  base64'd in at render time. Pink stays at accent level, per the ~5% rule. The
  mail app is the one light surface, and it is light precisely to signal that
  you have left the portal.
- **Fonts** — `assets/fonts.css` holds the latin subsets of Kanit, Barlow and
  JetBrains Mono, base64'd. Embedded rather than fetched so a render is
  identical offline and never races a webfont load.

## Making the taps readable

The opening originally showed the two front-door tiles at 1:1, where each is
about 85px on a 1080p frame — and this is watched on a phone. You could see
that something was tapped but not *which* tile, which is the one thing step 1
exists to teach: families go through **Dancer Portal**, not Staff Portal. Four
things fix it, and all four matter at small sizes:

1. The tiles are drawn larger than the app's own (198px tall, 20px labels).
   This screen is a recreation, not a screenshot, so it is allowed to be.
2. `spot` rings the target and drops the alternative to 26% — "not that one"
   is as much of the message as "this one".
3. `punch` scales the phone to 1.20 across the whole of step 1. It scales
   about the centre with no pan, which keeps it clear of the caption column
   and inside the frame; panning to centre a tile pushes it into the text.
4. The ripple `aim`s at the tile's icon well rather than its centre, so it
   never sits on the label you are meant to read.

The 30s cut also splits step 1 into two beats — *Tap Dancer Portal*, then
*Then tap Sign up* — so each choice gets its own headline and about two
seconds. The 15s cut keeps one beat but names both in it.

## If you re-cut it

Keep the captions. These are silent, autoplaying videos in a text message or on
a studio page — the words on screen are the whole explanation, not decoration
for a voiceover.

The outro shows the portal home with sections named **All Stars**, **Academy**
and **Billing & Admin**. The slugs are real (`PROGRAM_SLUGS`) but the display
names come from `portal_programs` in the database, so check them against the
studio's before sending either cut out.
