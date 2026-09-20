# "How to create your account" — 15s motion graphic

A 1920×1080 (16:9) explainer for families signing up to the parent portal.
Delivered at `docs/marketing/how-to-create-your-account.mp4`, with a poster
frame beside it.

| | |
|---|---|
| Duration | exactly 15.000s — 450 frames at 30fps |
| Format | H.264 High, yuv420p, `+faststart` |
| Size | ~1.2 MB |
| Audio | none — it is captioned throughout, so it works muted, which is how it will be watched |

## What it shows

The real flow, with the app's own words, so nothing a parent sees on screen
contradicts the video:

1. Front door → **Dancer Portal** → **Sign up** (`ChooserPage`, `PortalLogin`)
2. Name and **the Enrollio email** (`PortalSignUp`, step `details`)
3. A password, twice, 6+ characters (step `password`, `CLIENT_MIN_PASSWORD`)
4. The 6-digit code, and the spam-folder warning (step `verify`)

Two of these are the failures the signup endpoint cannot tell anyone about.
`portal-signup` answers `200 { ok: true }` whether or not the address is on the
roster — deliberately, so signup cannot be used to test which families attend —
so a parent who used the wrong address just never gets a code. The video says
both things out loud for the same reason the form does: it is the only place
they can be said.

## Regenerating

```bash
npm install --no-save playwright ffmpeg-static   # both, in ONE command
node scripts/marketing/signup-video/render.js
```

Install them together. `--no-save` leaves `package.json` alone, so a second
`npm install --no-save` prunes whatever the first one added.

Chromium comes from the pre-installed bundle. **ffmpeg does not** — the one
inside the Playwright bundle is built `--disable-everything` with VP8/WebM only
and dies on `Unrecognized option 'preset'`. `render.js` takes `$FFMPEG`, then
`ffmpeg-static`, then `ffmpeg` on `PATH`.

While iterating, render one frame instead of all 450 — about a second:

```bash
node scripts/marketing/signup-video/render.js --frame 6.2
```

Other flags: `--fps`, `--out`.

## How it is built

`template.html` is a standalone page whose every animated property is a pure
function of time. Nothing runs on a timer or a CSS animation: `__seek(t)` sets
the whole frame, and `render.js` calls it 450 times and screenshots each one.

That is why the output is exactly 15.000s with no dropped or duplicated frames
however slow the machine is — a screen recording of the same page would not be.
It is also why you can jump straight to a frame to look at it.

Editing:

- **Copy and pacing** — `SCENES` (scene bounds), `COPY` (the left-hand text),
  `SCREENS` (when the phone changes screen), `TAPS` (when and what is tapped).
  Keep the last `SCENES` entry ending at `DUR`.
- **Taps** are anchored by selector and measured off the live layout, not by
  hardcoded x/y, so they stay on target when copy above them rewraps. Same for
  the email callout.
- **Brand** — colours and type are the tokens from `public/brand/tokens.json`,
  and the mark is `public/brand/logos/didc-mark-3d.png` read from the repo,
  base64'd in at render time. Pink stays at accent level, per the ~5% rule.
- **Fonts** — `assets/fonts.css` holds the latin subsets of Kanit, Barlow and
  JetBrains Mono, base64'd. Embedded rather than fetched so a render is
  byte-identical offline and never races a webfont load.

## If you re-cut it

Keep the captions. It is a silent, autoplaying video in a text message or on a
studio page — the words on screen are the whole explanation, not decoration for
a voiceover.
