# Sign-up motion graphics

Three 16:9 films for families signing up to the parent portal. Two of them are
cuts of the same step-by-step explainer (`template.html`); the third is a
product film (`hero-template.html`) that makes one point instead of four.

All are 1920×1080, H.264 High / yuv420p, 30fps, `+faststart`, each with a
poster frame beside it. **None has audio** — they are captioned throughout, so
they work muted, which is how they will be watched.

| | The film | Length | Use it for |
|---|---|---|---|
| `hero-template.html` | `dancer-portal-enrollio-email-10s.mp4` | 10.000s | a post, a story, the top of a page — the announcement |
| `template.html --variant short` | `how-to-create-your-account-15s.mp4` | 15.000s | a text, a story, a reminder |
| `template.html --variant full` | `how-to-create-your-account-60s.mp4` | 60.000s | a family who is stuck, or a help page |

---

# 1. The hero film — `hero-template.html`

Ten seconds, one message: **sign up with the email Enrollio has for you.**

It is shot the way a phone is shot in a product ad — a light seamless sweep, a
single soft key light, the device floating at an angle with a real contact
shadow under it, turning to camera when there is something on screen to read.
The app's UI is dark, so on a light sweep the screen is the brightest thing in
the frame and the eye goes there without being told to.

The move is three beats and two turns:

| | Screen | Words |
|---|---|---|
| 0.0–3.5s | Front door — **Dancer Portal** is the pink-edged tile, as it is in the app | The new Dancer Portal |
| 3.5–7.6s | Create account, the email typing in | Sign up with your **Enrollio** email |
| 7.6–10.0s | Portal home, *Hi, Sarah* | You're in. → Dancer Portal → Sign up → your Enrollio email |

The address is set **twice**: on the phone, where it is small and typing, and
beside it as a plain white chip at 30px mono, which is what actually survives
being watched on a phone. Same for the device angle — it sits at a 20° hero
pose for the announcement and turns to within 3.5° of flat for the middle
beat, because at 20° the text on the screen is foreshortened past reading.

Everything in the frame is derived from the pose rather than keyframed beside
it: the shadow's blur, darkness and spread come from how high the phone is
sitting, and the specular band on the glass slides with the rotation. Keyframe
those separately and they drift out of sync with the device the moment the
motion is re-timed.

What it does **not** do is explain the verification code, the password rules,
or what happens if the address is wrong. Ten seconds does not hold four steps.
That is what the explainer below is for — this one exists to get somebody to
open the app at all.

```bash
node scripts/marketing/signup-video/render.js --template hero-template.html
```

It shares `render.js`, `assets/fonts.css` and the app's screen CSS with the
explainer, but carries its own copy of that CSS rather than importing it — the
two films light the same screens very differently and should be able to move
apart without one breaking the other.

---

# 2. The explainer — `template.html`

Two cuts of one 16:9 step-by-step, both built from `template.html`:

| | `--variant full` | `--variant short` |
|---|---|---|
| File | `docs/marketing/how-to-create-your-account-60s.mp4` | `…-15s.mp4` |
| Length | exactly 60.000s (1800 frames) | exactly 15.000s (450 frames) |
| Size | ~3.1 MB | ~1.4 MB |
| For | sending to a family who is stuck, or a help page | a text, a story, a reminder |

## What they show

The real flow, in the app's own words, so nothing on screen contradicts what a
parent is looking at:

1. Front door → **Dancer Portal** → **Sign up** (`ChooserPage`, `PortalLogin`)
   — which of the two doors, and which of the two buttons, is the thing the
   opening has to make unmissable; see **Making the taps readable** below
2. Name and **the Enrollio email** (`PortalSignUp`, step `details`)
3. A password, twice, 6+ characters (step `password`, `CLIENT_MIN_PASSWORD`)
4. The 6-digit code (step `verify`)

The long cut adds the two things the 15s can only assert:

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
junk-folder warning and the long cut spends a full beat on the Enrollio point.

## Regenerating

```bash
npm install --no-save playwright ffmpeg-static   # both, in ONE command
cd scripts/marketing/signup-video
node render.js --template hero-template.html     # 10s, ~2 min
node render.js --variant short                   # 15s, ~2.5 min
node render.js --variant full                    # 60s, ~9 min
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

Other flags: `--template`, `--fps`, `--out`. The output filename is built from
`window.__name` and `window.__dur` on the page itself, so it cannot drift from
the timeline the way a hardcoded name does — that is how a file called `-30s`
outlived the 30s cut once already.

## How both are built

Each template is a standalone page whose every animated property is a pure
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

## Pacing: why the long cut is 60s and not a slower 30s

The 30s cut moved faster than anyone could read it. The fix is **dwell time,
not slow motion**: `holds` is a list of `[source time, seconds added]`, and
`warp()` maps output time to source time — 1:1 between holds, and frozen
inside one. Every animation therefore keeps the speed it was designed at, and
the picture simply stops at the moments where there is something to read.

Halving the rate instead would have stretched the typing, the transitions and
the tap ripples to half speed, which reads as broken rather than as generous.

Each hold sits on a frame where nothing is mid-motion — no transition running,
no caret lit, no glow still easing — otherwise it freezes an element at 86%
opacity for three seconds and looks like a bug. The comments on each entry say
what the viewer is meant to be reading. The longest is the code itself.

`holds` is the whole of it: the 60s cut and the 30s cut it replaced produce the
same frames in the same order, because `seek()` does the identical work on the
source time it is handed. A cut with no `holds` key, like `short`, passes
straight through unchanged.

To re-pace, edit the numbers. They must still sum to whatever you want added.

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

The long cut also splits step 1 into two beats — *Tap Dancer Portal*, then
*Then tap Sign up* — so each choice gets its own headline and about two
seconds. The 15s cut keeps one beat but names both in it.

## If you re-cut it

Keep the captions. These are silent, autoplaying videos in a text message or on
a studio page — the words on screen are the whole explanation, not decoration
for a voiceover.

The outro of **all three films** shows the portal home with sections named
**All Stars**, **Academy** and **Billing & Admin**. The slugs are real
(`PROGRAM_SLUGS`) but the display names come from `portal_programs` in the
database, so check them against the studio's before sending any of them out.
They appear in both templates; change both.
